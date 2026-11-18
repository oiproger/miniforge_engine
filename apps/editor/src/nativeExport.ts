import { strToU8, zipSync } from 'fflate'
import manifest from '../../editor-desktop/src-tauri/Cargo.toml?raw'
import lockfile from '../../editor-desktop/src-tauri/Cargo.lock?raw'
import main from '../../editor-desktop/src-tauri/src/main.rs?raw'
import buildScript from '../../editor-desktop/src-tauri/build.rs?raw'
import icon from '../../editor-desktop/src-tauri/icons/icon.png?url'
import windowsIcon from '../../editor-desktop/src-tauri/icons/icon.ico?url'
import { buildGame } from '../../../packages/exporter/src'
import type { Project } from '../../../packages/project-schema/src'

export async function desktopSources(project: Project, platform: 'windows' | 'linux') {
  const web = await buildGame(project, 'web')
  const target = platform === 'windows' ? 'nsis' : 'deb'
  const config = {
    productName: project.name.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 64) || 'Miniforge Game',
    version: '0.1.0',
    identifier: 'dev.miniforge.game.' + project.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 55),
    build: { frontendDist: '../game' },
    app: { windows: [{ label: 'game', title: project.name, width: 1152, height: 768 }] },
    bundle: { active: true, targets: [target], icon: ['icons/icon.png', 'icons/icon.ico'] },
  }
  const files: Record<string, Uint8Array> = {}
  for (const [path, data] of Object.entries(web.files)) files['game/' + path] = data
  const source: Record<string, string> = {
    'src-tauri/Cargo.toml': manifest,
    'src-tauri/Cargo.lock': lockfile,
    'src-tauri/src/main.rs': main,
    'src-tauri/build.rs': buildScript,
    'src-tauri/tauri.conf.json': JSON.stringify(config, null, 2),
    'package.json': JSON.stringify(
      {
        name: 'miniforge-game-build',
        private: true,
        scripts: { build: 'tauri build --bundles ' + target },
        devDependencies: { '@tauri-apps/cli': '2.12.5' },
      },
      null,
      2,
    ),
    'README.txt':
      (platform === 'windows'
        ? 'Windows: install Rust stable, MSVC C++ Build Tools, WebView2 and Node.js.'
        : 'Linux: install Rust stable, Node.js, WebKitGTK 4.1 development headers, librsvg2-dev, libayatana-appindicator3-dev and build-essential.') +
      '\nRun npm install and npm run build from this directory on the target OS.\nInstaller output: src-tauri/target/release/bundle/' +
      target +
      '/',
  }
  for (const [path, data] of Object.entries(source)) files[path] = strToU8(data)
  for (const [name, url] of Object.entries({ 'icon.png': icon, 'icon.ico': windowsIcon })) {
    const res = await fetch(url)
    if (!res.ok) throw Error('Cannot read application icon')
    files['src-tauri/icons/' + name] = new Uint8Array(await res.arrayBuffer())
  }
  const zip = zipSync(files)
  return {
    blob: new Blob([Uint8Array.from(zip)], { type: 'application/zip' }),
    report: {
      profile: platform,
      artifact: 'Tauri build project',
      files: Object.keys(files),
      compressed: zip.length,
      game: web.report,
    },
  }
}
