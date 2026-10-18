/** No-account or explicitly selected manual-login browser observation. Run from a checkout with collector dependencies installed. */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/collector/package.json', import.meta.url));
const { chromium } = require('playwright');
import { parseOptions, prepareProfile } from './browser-profile.mjs';
let options;
try { options = parseOptions(process.argv.slice(2)); }
catch { console.error('Usage: node tools/investigation/observe-login-bootstrap.mjs [chrome] [--login] [--profile ABSOLUTE_PATH] [--prepare-profile]'); process.exit(1); }
const { manual, channel } = options;
let profile;
try { if (options.profile) profile = await prepareProfile(options.profile); }
catch { console.error('PROFILE_REJECTED: use an empty dedicated directory outside the repository, never the daily Chrome profile.'); process.exit(1); }
if (options.prepare) { console.error('Dedicated profile prepared. Close its manual Chrome before running the observer.'); process.exit(0); }
const summary = {
  schema: manual ? 'x-manual-login-observation/v1' : 'x-no-account-bootstrap/v1', atUtc: new Date().toISOString(),
  initialAuthCookiePresent: false, profilePersistenceEnabled: !!profile, viewportMode: 'native-window', localeMode: 'system-default', timezoneMode: 'system-default',
  browserVersion: null, homepageStatus: null, finalOrigin: null,
  outcome: 'NOT_STARTED', requests: 0, failedRequests: 0, pageErrors: 0,
  scripts: { castle: 0, prelude: 0, transaction: 0 },
  landingStatuses: [], actionRequests: 0, signalsStatuses: [],
  guest: { gtPresent: false, guestIdPresent: false, authCookiePresent: false,
    headerRequests: 0, matchingCurrentGt: 0, transactionHeaderRequests: 0 },
  cleanup: 'NOT_LAUNCHED',
};
const started = Date.now();
const events = [];
const actions = new Set(['begin_login', 'login_enter_password', 'begin_login_acid', 'finish_login_acid']);
let sequence = 0;
const requests = new WeakMap();
function classify(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.origin === 'https://edge.prelude.dev' && url.pathname === '/v1/signals') return 'signals';
  if (url.origin === 'https://jf.x.com' && url.pathname === '/onboarding/web/landing') return 'landing';
  if (url.origin === 'https://jf.x.com' && url.pathname.startsWith('/onboarding/web/actions/')) {
    const action = url.pathname.slice('/onboarding/web/actions/'.length);
    return actions.has(action) ? action : 'UNKNOWN_ACTION';
  }
  return null;
}
function record(request, status) {
  if (!manual) return;
  const kind = classify(request.url());
  if (!kind) return;
  let id = requests.get(request);
  if (!id) { id = ++sequence; requests.set(request, id); }
  if (events.length < 128) events.push({ id, kind, elapsedMs: Date.now() - started, status });
  else summary.eventsTruncated = true;
  console.error(`[observe] ${kind} ${status ?? 'REQUEST'}`);
  if (kind === 'UNKNOWN_ACTION') {
    summary.outcome = 'UNKNOWN_ACTION_STOPPED';
    void finish();
  }
}
let browser, persistentContext, finishing = false;
let stage = 'LAUNCH';
const progress = (next) => { stage = next; console.error(`[observe] ${next}`); };
const bounded = (promise, milliseconds) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('OBSERVATION_TIMEOUT')), milliseconds);
  Promise.resolve(promise).then(
    (result) => { clearTimeout(timer); resolve(result); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});
async function finish() {
  if (finishing) return;
  finishing = true;
  clearTimeout(watchdog);
  summary.lastStage = stage;
  if (manual) { summary.events = events; summary.identityVerified = false; summary.sessionSaved = profile ? null : false; summary.sessionExported = false; }
  progress('CLEANUP');
  if (persistentContext || browser) {
    try { await bounded(persistentContext ? persistentContext.close() : browser.close(), 5_000); summary.cleanup = 'CLOSED'; }
    catch { summary.cleanup = 'CLOSE_FAILED_OR_TIMED_OUT'; }
  }
  // A stuck protocol connection must not prevent the diagnostic result from appearing.
  const exitCode = ['OBSERVATION_COMPLETE_UNVERIFIED', 'MANUAL_OBSERVATION_COMPLETE_UNVERIFIED', 'LOGIN_CANDIDATE_UNVERIFIED'].includes(summary.outcome) && summary.cleanup === 'CLOSED' ? 0 : 1;
  const exitTimer = setTimeout(() => process.exit(exitCode), 1_000);
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n', () => {
    clearTimeout(exitTimer); process.exit(exitCode);
  });
}
const watchdog = setTimeout(() => {
  summary.outcome = 'OBSERVATION_TOTAL_TIMEOUT';
  void finish();
}, manual ? 600_000 : 60_000);
process.once('SIGINT', () => { summary.outcome = 'CANCELLED'; void finish(); });
try {
  progress('LAUNCH');
  let context;
  if (profile) {
    console.error('[observe] PERSISTENT_PROFILE: browser-managed cookies and storage remain in the dedicated directory.');
    persistentContext = await chromium.launchPersistentContext(profile, {
      channel: 'chrome', headless: false, viewport: null,
    });
    context = persistentContext;
    browser = context.browser();
    summary.browserVersion = browser?.version() ?? null;
  } else {
    browser = await chromium.launch({ headless: false, ...(channel ? { channel } : {}) });
    summary.browserVersion = browser.version();
    progress('CREATE_CONTEXT');
    context = await bounded(browser.newContext({ viewport: null }), 10_000);
  }
  if (profile) {
    const initialCookies = await bounded(context.cookies(['https://x.com/', 'https://jf.x.com/']), 5_000);
    summary.initialAuthCookiePresent = initialCookies.some((c) => ['auth_token', 'twid'].includes(c.name) && !!c.value);
  }
  progress('CREATE_PAGE');
  const page = profile && context.pages().length ? context.pages()[0] : await bounded(context.newPage(), 10_000);
  const pending = new Set();
  const track = (promise) => {
    pending.add(promise);
    promise.finally(() => pending.delete(promise)).catch(() => {});
  };
  context.on('request', (request) => {
    summary.requests++;
    record(request, null);
    const url = new URL(request.url());
    if (url.origin === 'https://jf.x.com' && url.pathname.startsWith('/onboarding/web/actions/'))
      summary.actionRequests++;
    // Only compare scoped guest values in memory; never emit headers or tokens.
    if (!['https://x.com', 'https://jf.x.com', 'https://api.x.com'].includes(url.origin)) return;
    track((async () => {
      const headers = await bounded(request.allHeaders(), 3_000);
      if (headers['x-client-transaction-id']) summary.guest.transactionHeaderRequests++;
      if (!headers['x-guest-token']) return;
      summary.guest.headerRequests++;
      const current = (await bounded(context.cookies(request.url()), 3_000)).filter((c) => c.name === 'gt');
      if (current.length === 1 && current[0].value === headers['x-guest-token'])
        summary.guest.matchingCurrentGt++;
    })().catch(() => { summary.pageErrors++; }));
  });
  context.on('requestfailed', () => { summary.failedRequests++; });
  page.on('pageerror', () => { summary.pageErrors++; });
  context.on('response', (response) => {
    record(response.request(), response.status());
    const url = new URL(response.url());
    if (url.origin === 'https://jf.x.com' && url.pathname === '/onboarding/web/landing')
      summary.landingStatuses.push(response.status());
    if (url.origin === 'https://edge.prelude.dev' && url.pathname === '/v1/signals')
      summary.signalsStatuses.push(response.status());
    if (response.request().resourceType() !== 'script' || response.status() !== 200) return;
    // Resource delivery only; this does not establish SDK execution or token generation.
    if (/castle/i.test(url.pathname)) summary.scripts.castle++;
    if (/\/signals[-.]/.test(url.pathname)) summary.scripts.prelude++;
    if (/\/sign\.o[-.]/.test(url.pathname)) summary.scripts.transaction++;
  });
  // Observe normal site activity only. No filling, clicking, SDK invocation or request interception.
  progress('NAVIGATE');
  const response = await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  summary.homepageStatus = response?.status() ?? null;
  if (summary.homepageStatus !== 200) summary.outcome = 'HOMEPAGE_REFUSED';
  else {
    if (manual) {
      progress('WAIT_FOR_MANUAL_LOGIN');
      console.error('请仅在浏览器输入账号、密码和验证码。进入首页后回到终端按 Enter 结束。未知挑战请按 Ctrl+C 停止；最多等待10分钟。' + (profile ? '专用目录会保留浏览器登录态。' : '不保存会话。'));
      const { createInterface } = await import('node:readline');
      const input = createInterface({ input: process.stdin, terminal: false });
      try { await new Promise((resolve) => { input.once('line', resolve); input.once('close', resolve); }); }
      finally { input.close(); }
    } else {
      progress('OBSERVE_15_SECONDS');
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    }
    summary.outcome = 'OBSERVATION_COMPLETE_UNVERIFIED';
  }
  summary.finalOrigin = new URL(page.url()).origin;
  progress('DRAIN_METADATA');
  await bounded(Promise.allSettled([...pending]), 5_000);
  progress('READ_COOKIE_PRESENCE');
  const cookies = await bounded(context.cookies(['https://x.com/', 'https://jf.x.com/']), 5_000);
  summary.guest.gtPresent = cookies.some((c) => c.name === 'gt' && !!c.value);
  summary.guest.guestIdPresent = cookies.some((c) => c.name === 'guest_id' && !!c.value);
  summary.guest.authCookiePresent = cookies.some((c) => ['auth_token', 'twid'].includes(c.name) && !!c.value);
  if (manual && summary.homepageStatus === 200) {
    summary.outcome = summary.guest.authCookiePresent && new URL(page.url()).pathname === '/home'
      ? 'LOGIN_CANDIDATE_UNVERIFIED' : 'MANUAL_OBSERVATION_COMPLETE_UNVERIFIED';
  } else if (summary.guest.authCookiePresent) summary.outcome = 'UNEXPECTED_ACCOUNT_CONTEXT';
} catch {
  summary.outcome = 'OBSERVATION_FAILED';
} finally {
  await finish();
}
