import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOptions, prepareProfile } from './browser-profile.mjs';
test('options require an explicit absolute profile and preserve temporary default', () => {
  assert.equal(parseOptions(['chrome','--login']).profile, undefined);
  assert.equal(parseOptions(['--profile',join(tmpdir(),'dedicated')]).channel, 'chrome');
  for (const args of [['--profile','relative'],['--prepare-profile'],['--login','--login'],['--unknown']])
    assert.throws(()=>parseOptions(args));
});
test('empty dedicated profile is marked; reused, occupied and daily directories are distinguished', async () => {
  const root = await mkdtemp(join(tmpdir(),'profile-policy-'));
  try {
    const dedicated = join(root,'dedicated');
    assert.equal(await prepareProfile(dedicated), await prepareProfile(dedicated));
    const occupied = join(root,'occupied'); await mkdir(occupied); await writeFile(join(occupied,'data'),'private');
    await assert.rejects(prepareProfile(occupied), /PROFILE_MUST_BE_EMPTY_OR_MARKED/);
    await assert.rejects(prepareProfile(join(root,'Google','Chrome','User Data')), /DAILY_PROFILE_NOT_ALLOWED/);
    const repo = fileURLToPath(new URL('../../', import.meta.url));
    await assert.rejects(prepareProfile(repo), /PROFILE_OUTSIDE_REPOSITORY_REQUIRED/);
    await assert.rejects(prepareProfile(join(repo,'..private-profile')), /PROFILE_OUTSIDE_REPOSITORY_REQUIRED/);
    if (process.platform !== 'win32') {
      const link = join(root,'repo-link'); await symlink(repo,link);
      await assert.rejects(prepareProfile(link), /PROFILE_OUTSIDE_REPOSITORY_REQUIRED/);
    }
  } finally { await rm(root,{recursive:true,force:true}); }
});
