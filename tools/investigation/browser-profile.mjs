import { mkdir, readdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const marker = '.x-investigation-profile.json';
export function parseOptions(args) {
  const options = { manual: false, channel: undefined, profile: undefined, prepare: false };
  const used = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (used.has(arg)) throw Error('INVALID_OPTIONS');
    used.add(arg);
    if (arg === 'chrome') options.channel = 'chrome';
    else if (arg === '--login') options.manual = true;
    else if (arg === '--prepare-profile') options.prepare = true;
    else if (arg === '--profile') {
      if (!args[i + 1] || !isAbsolute(args[i + 1])) throw Error('PROFILE_ABSOLUTE_PATH_REQUIRED');
      options.profile = resolve(args[++i]);
    } else throw Error('INVALID_OPTIONS');
  }
  if (options.prepare && !options.profile) throw Error('PROFILE_REQUIRED');
  if (options.profile) options.channel = 'chrome';
  return options;
}
/** Only empty or explicitly marked investigation profiles outside this checkout. */
export async function prepareProfile(input) {
  if (!isAbsolute(input)) throw Error('PROFILE_ABSOLUTE_PATH_REQUIRED');
  const lexical = relative(repo, resolve(input));
  if (!lexical || (lexical !== '..' && !lexical.startsWith(`..${sep}`) && !isAbsolute(lexical))) throw Error('PROFILE_OUTSIDE_REPOSITORY_REQUIRED');
  await mkdir(input, { recursive: true, mode: 0o700 });
  const directory = await realpath(input), root = await realpath(repo);
  const rel = relative(root, directory);
  if (!rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw Error('PROFILE_OUTSIDE_REPOSITORY_REQUIRED');
  if (/\/(?:google\/chrome(?: beta| dev| sxs)?\/user data|\.config\/google-chrome|library\/application support\/google\/chrome)(?:\/|$)/i
    .test(directory.replaceAll('\\', '/'))) throw Error('DAILY_PROFILE_NOT_ALLOWED');
  const files = await readdir(directory);
  if (files.includes(marker)) {
    let data;
    try { data = JSON.parse(await readFile(resolve(directory, marker), 'utf8')); }
    catch { throw Error('PROFILE_MARKER_INVALID'); }
    if (data.kind !== 'x-investigation-profile/v1') throw Error('PROFILE_MARKER_INVALID');
  } else {
    if (files.length) throw Error('PROFILE_MUST_BE_EMPTY_OR_MARKED');
    await writeFile(resolve(directory, marker), JSON.stringify({kind:'x-investigation-profile/v1'}), {flag:'wx',mode:0o600});
  }
  return directory;
}
