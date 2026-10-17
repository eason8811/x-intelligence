/** No-account browser observation. Run from a checkout with collector dependencies installed. */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/collector/package.json', import.meta.url));
const { chromium } = require('playwright');
const channel = process.argv[2];
if (channel && channel !== 'chrome') {
  console.error('Usage: node tools/investigation/observe-login-bootstrap.mjs [chrome]');
  process.exit(1);
}
const summary = {
  schema: 'x-no-account-bootstrap/v1', atUtc: new Date().toISOString(),
  browserVersion: null, homepageStatus: null, finalOrigin: null,
  outcome: 'NOT_STARTED', requests: 0, failedRequests: 0, pageErrors: 0,
  scripts: { castle: 0, prelude: 0, transaction: 0 },
  landingStatuses: [], actionRequests: 0, signalsStatuses: [],
  guest: { gtPresent: false, guestIdPresent: false, authCookiePresent: false,
    headerRequests: 0, matchingCurrentGt: 0, transactionHeaderRequests: 0 },
  cleanup: 'NOT_LAUNCHED',
};
let browser;
try {
  browser = await chromium.launch({ headless: false, ...(channel ? { channel } : {}) });
  summary.browserVersion = browser.version();
  // An isolated temporary context; never import the user's profile or storageState.
  const context = await browser.newContext();
  const page = await context.newPage();
  const pending = new Set();
  const track = (promise) => {
    pending.add(promise);
    promise.finally(() => pending.delete(promise)).catch(() => {});
  };
  context.on('request', (request) => {
    summary.requests++;
    const url = new URL(request.url());
    if (url.origin === 'https://jf.x.com' && url.pathname.startsWith('/onboarding/web/actions/'))
      summary.actionRequests++;
    // Only compare scoped guest values in memory; never emit headers or tokens.
    if (!['https://x.com', 'https://jf.x.com', 'https://api.x.com'].includes(url.origin)) return;
    track((async () => {
      const headers = await request.allHeaders();
      if (headers['x-client-transaction-id']) summary.guest.transactionHeaderRequests++;
      if (!headers['x-guest-token']) return;
      summary.guest.headerRequests++;
      const current = (await context.cookies(request.url())).filter((c) => c.name === 'gt');
      if (current.length === 1 && current[0].value === headers['x-guest-token'])
        summary.guest.matchingCurrentGt++;
    })().catch(() => { summary.pageErrors++; }));
  });
  context.on('requestfailed', () => { summary.failedRequests++; });
  page.on('pageerror', () => { summary.pageErrors++; });
  context.on('response', (response) => {
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
  const response = await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  summary.homepageStatus = response?.status() ?? null;
  if (summary.homepageStatus !== 200) summary.outcome = 'HOMEPAGE_REFUSED';
  else {
    await page.waitForTimeout(15_000);
    summary.outcome = 'OBSERVATION_COMPLETE_UNVERIFIED';
  }
  summary.finalOrigin = new URL(page.url()).origin;
  await Promise.allSettled([...pending]);
  const cookies = await context.cookies(['https://x.com/', 'https://jf.x.com/']);
  summary.guest.gtPresent = cookies.some((c) => c.name === 'gt' && !!c.value);
  summary.guest.guestIdPresent = cookies.some((c) => c.name === 'guest_id' && !!c.value);
  summary.guest.authCookiePresent = cookies.some((c) => ['auth_token', 'twid'].includes(c.name) && !!c.value);
  if (summary.guest.authCookiePresent) summary.outcome = 'UNEXPECTED_ACCOUNT_CONTEXT';
} catch {
  summary.outcome = 'OBSERVATION_FAILED';
} finally {
  if (browser) {
    try { await browser.close(); summary.cleanup = 'CLOSED'; }
    catch { summary.cleanup = 'CLOSE_FAILED'; }
  }
  console.log(JSON.stringify(summary, null, 2));
}
