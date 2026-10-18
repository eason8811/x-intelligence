import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = readFileSync(new URL('./observe-login-bootstrap.mjs', import.meta.url), 'utf8');
function run(mode) {
  const directory = mkdtempSync(join(tmpdir(), 'bootstrap-observer-'));
  try {
    const fake = `
const handlers = {};
const page = { on() {}, url: () => 'https://x.com/', async goto() {
 handlers.request?.({url:()=> 'https://x.com/', allHeaders:()=>new Promise(()=>{})});
 return {status:()=>200};
} };
const context = { on(name, fn) {handlers[name]=fn;},
 newPage: () => ${mode === 'page-stuck' ? 'new Promise(()=>{})' : 'Promise.resolve(page)'},
 cookies: async () => [] };
const chromium = {launch: async () => ({version:()=> 'synthetic',newContext:async()=>context,
 close: () => ${mode === 'close-stuck' ? 'new Promise(()=>{})' : 'Promise.resolve()'}})};
`;
    let script = fake + source.slice(source.indexOf('const channel ='));
    for (const [from, to] of [['60_000','500'], ['15_000','5'], ['10_000','20'], ['5_000','30'], ['3_000','10'], ['1_000','10']])
      script = script.replaceAll(from, to);
    const file = join(directory, 'probe.mjs'); writeFileSync(file, script);
    const result = spawnSync(process.execPath, [file], { encoding:'utf8', timeout:3000 });
    assert.equal(result.signal, null); assert.equal(result.error, undefined);
    return { ...result, summary:JSON.parse(result.stdout) };
  } finally { rmSync(directory, {recursive:true, force:true}); }
}
test('unresolved request metadata cannot prevent a diagnostic result', () => {
  const result = run('normal');
  assert.equal(result.status, 0);
  assert.equal(result.summary.outcome, 'OBSERVATION_COMPLETE_UNVERIFIED');
  assert.equal(result.summary.cleanup, 'CLOSED');
  assert.equal(result.summary.pageErrors, 1);
  assert.match(result.stderr, /DRAIN_METADATA/);
});
test('stuck page creation and browser close are bounded', () => {
  const page = run('page-stuck');
  assert.equal(page.status, 1); assert.equal(page.summary.lastStage, 'CREATE_PAGE');
  const close = run('close-stuck');
  assert.equal(close.summary.cleanup, 'CLOSE_FAILED_OR_TIMED_OUT');
  assert.match(close.stderr, /CLEANUP/);
});
