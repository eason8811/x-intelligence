import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
test("summary excludes secrets and untrusted error details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "login-context-"));
  try {
    const file = join(dir, "fixture.har");
    const entry = (url, method = "GET") => ({request:{url,method,headers:[
      {name:"cookie",value:"gt=TEST_SECRET; guest_id=TEST_SECRET"},
      {name:"authorization",value:"TEST_SECRET"}],postData:{text:"TEST_SECRET"}},
      response:{status:200,headers:[{name:"set-cookie",value:"gt=TEST_SECRET; Secure; Path=/"}],content:{text:"TEST_SECRET"}}});
    await writeFile(file, JSON.stringify({log:{entries:[entry("https://x.com/"),
      entry("https://api.twitter.com/1.1/guest/activate.json", "POST"),
      entry("https://jf.x.com/onboarding/web/landing?session=TEST_SECRET")]}}));
    const run = () => spawnSync(process.execPath, [new URL("./summarize-login-context.mjs", import.meta.url).pathname, file], {encoding:"utf8"});
    const result = run();assert.equal(result.status,0);assert.equal(result.stdout.includes("TEST_SECRET"),false);
    const output = JSON.parse(result.stdout);assert.equal(output.firstHomepage.guestCookiePresent,true);
    assert.equal(output.firstHomepage.responseGtNonempty,true);
    assert.equal(output.firstHomepage.responseCt0Nonempty,false);
    assert.equal(output.selected[0].kind,"guest_activation");assert.equal(output.cleanBootstrapProven,false);
    await writeFile(file, "TEST_SECRET");const invalid = run();assert.equal(invalid.status,1);
    assert.equal((invalid.stdout+invalid.stderr).includes("TEST_SECRET"),false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
