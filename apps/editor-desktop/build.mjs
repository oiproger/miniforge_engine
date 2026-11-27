import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const [mode = 'editor', gameDirectory = 'dist/games/web'] = process.argv.slice(2);
if (!['editor', 'game'].includes(mode)) throw new Error('Use editor or game [web-build-directory].');
if (!['linux', 'win32', 'darwin'].includes(process.platform)) throw new Error('Build on Linux, Windows, or macOS.');

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const rawVersion = (process.env.APP_VERSION || rootPkg.version || '2.7.0').trim().replace(/^v/i, '');
const appVersion = /^\d+\.\d+\.\d+/.test(rawVersion) ? rawVersion : (rootPkg.version || '2.7.0');
console.log(`[miniforge-desktop] Building ${mode} v${appVersion} for ${process.platform}${process.env.TAURI_TARGET ? ' (' + process.env.TAURI_TARGET + ')' : ''}`);

const cli = join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const frontendDist = resolve(root, mode === 'editor' ? 'dist/editor' : gameDirectory);
if (!existsSync(join(frontendDist, 'index.html'))) throw new Error('Build the editor or export the Web Standalone game before packaging: ' + frontendDist);
const bundles = process.platform === 'linux' ? 'deb' : process.platform === 'darwin' ? 'app,dmg' : 'nsis';
const args = [cli, 'build', '--bundles', bundles];
if (process.env.TAURI_TARGET) args.push('--target', process.env.TAURI_TARGET);
let env = process.env;
if (mode === 'editor') {
  const metadata = spawnSync('cargo', ['metadata', '--format-version', '1', '--locked', '--features', 'editor,steamworks'], {
    cwd: join(directory, 'src-tauri'),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (metadata.error) throw metadata.error;
  if (metadata.status !== 0) throw new Error(metadata.stderr);
  const steam = JSON.parse(metadata.stdout).packages.find((pkg) => pkg.name === 'steamworks-sys');
  if (!steam) throw new Error('Cargo metadata did not include steamworks-sys.');
  let sdk = process.env.STEAM_SDK_LOCATION
    ? resolve(directory, 'src-tauri', process.env.STEAM_SDK_LOCATION)
    : join(dirname(steam.manifest_path), 'lib', 'steam');
  const arch = process.env.TAURI_TARGET?.split('-')[0] ?? process.arch;
  const is32Bit = arch === 'ia32' || arch === 'i686';
  const steamLibrary = process.platform === 'win32'
    ? [is32Bit ? '' : 'win64', is32Bit ? 'steam_api.dll' : 'steam_api64.dll']
    : process.platform === 'darwin'
      ? ['osx', 'libsteam_api.dylib']
      : [is32Bit ? 'linux32' : arch === 'aarch64' || arch === 'arm64' ? 'linuxarm64' : 'linux64', 'libsteam_api.so'];
  let library = join(sdk, 'redistributable_bin', ...steamLibrary);
  if (!existsSync(library)) throw new Error('Steam redistributable not found: ' + library);
  if (process.platform === 'darwin') {
    // The SDK carries an @loader_path ID, while Tauri signs and ships dylibs in Contents/Frameworks.
    sdk = mkdtempSync(join(tmpdir(), 'miniforge-steam-sdk-'));
    process.once('exit', () => rmSync(sdk, { recursive: true, force: true }));
    const stagedLibrary = join(sdk, 'redistributable_bin', ...steamLibrary);
    mkdirSync(dirname(stagedLibrary), { recursive: true });
    copyFileSync(library, stagedLibrary);
    for (const [tool, ...options] of [
      ['install_name_tool', '-id', '@rpath/libsteam_api.dylib', stagedLibrary],
      ['codesign', '--force', '--sign', '-', stagedLibrary],
    ]) {
      const result = spawnSync(tool, options, { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(tool + ' failed for ' + stagedLibrary);
    }
    library = stagedLibrary;
  }
  const bundle = process.platform === 'win32'
    ? { resources: { [library]: steamLibrary[1] } }
    : process.platform === 'darwin'
      ? { macOS: { frameworks: [library] } }
      : { linux: { deb: { files: { '/usr/lib/miniforge-editor/libsteam_api.so': library } } } };
  env = { ...env, STEAM_SDK_LOCATION: sdk };
  if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = [dirname(library), env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  }
  args.push('--features', 'editor,steamworks', '--config', JSON.stringify({ version: appVersion, bundle }));
} else {
  args.push('--config', 'src-tauri/game.conf.json', '--config', JSON.stringify({ version: appVersion, build: { frontendDist } }));
}
const child = spawnSync(process.execPath, args, { cwd: directory, env, stdio: 'inherit' });
if (child.error) throw child.error;
process.exit(child.status ?? 1);
