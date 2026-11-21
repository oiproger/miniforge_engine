import { strToU8, zipSync } from 'fflate'
import manifest from '../../editor-desktop/src-tauri/Cargo.toml?raw'
import lockfile from '../../editor-desktop/src-tauri/Cargo.lock?raw'
import main from '../../editor-desktop/src-tauri/src/main.rs?raw'
import buildScript from '../../editor-desktop/src-tauri/build.rs?raw'
import icon from '../../editor-desktop/src-tauri/icons/icon.png?url'
import windowsIcon from '../../editor-desktop/src-tauri/icons/icon.ico?url'
import { buildGame } from '../../../packages/exporter/src'
import { defaultExportSettings, type ExportSettingsConfig, type Project } from '../../../packages/project-schema/src'

export type DesktopPlatform = 'windows' | 'linux' | 'macos'

function dataUrlToUint8(url: string): Uint8Array | null {
  const idx = url.indexOf(',')
  if (idx < 0) return null
  const bin = atob(url.slice(idx + 1))
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 64) || 'Miniforge Game'
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildMacInfoPlist(cfg: ExportSettingsConfig, exeName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${escapeXml(cfg.appName)}</string>
  <key>CFBundleDisplayName</key>
  <string>${escapeXml(cfg.appName)}</string>
  <key>CFBundleIdentifier</key>
  <string>${escapeXml(cfg.identifier)}</string>
  <key>CFBundleVersion</key>
  <string>${escapeXml(cfg.version)}</string>
  <key>CFBundleShortVersionString</key>
  <string>${escapeXml(cfg.version)}</string>
  <key>CFBundleExecutable</key>
  <string>${escapeXml(exeName)}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`
}

async function resolveTemplateBinary(
  platform: DesktopPlatform,
  cfg: ExportSettingsConfig,
  localBinary?: Uint8Array,
): Promise<Uint8Array | null> {
  if (localBinary && localBinary.byteLength > 1024) return localBinary
  const base = (cfg.templateBaseUrl || './export-templates/').replace(/\/+$/, '')
  const fileName =
    platform === 'windows'
      ? 'miniforge-player-windows.exe'
      : platform === 'macos'
        ? 'miniforge-player-macos'
        : 'miniforge-player-linux'
  try {
    const res = await fetch(`${base}/${fileName}`)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html')) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    return buf.byteLength > 1024 ? buf : null
  } catch {
    return null
  }
}

export async function desktopSources(
  project: Project,
  platform: DesktopPlatform,
  localTemplates?: Partial<Record<DesktopPlatform, { name: string; bytes: Uint8Array }>>,
) {
  const cfg: ExportSettingsConfig = {
    ...defaultExportSettings(project),
    ...(project.settings.export || {}),
  }
  const safeName = sanitizeFileName(cfg.appName || project.name)
  const web = await buildGame(project, 'web')

  // Inject game.config.json into game/ for universal Export Template player
  const gameConfigJson = JSON.stringify(
    {
      title: cfg.appName || project.name,
      version: cfg.version || '1.0.0',
      identifier: cfg.identifier,
      author: cfg.author || '',
      width: cfg.windowWidth || 1280,
      height: cfg.windowHeight || 720,
      fullscreen: Boolean(cfg.fullscreen),
      resizable: cfg.resizable !== false,
      decorated: cfg.decorated !== false,
    },
    null,
    2,
  )

  // Mode 1: Instant Executable via prebuilt Export Template binary (no Rust/Xcode/MSVC needed!)
  if (cfg.desktopMode === 'template') {
    const playerBin = await resolveTemplateBinary(platform, cfg, localTemplates?.[platform]?.bytes)
    if (playerBin) {
      const files: Record<string, Uint8Array> = {}
      if (platform === 'macos') {
        const appRoot = `${safeName}.app`
        const exeName = 'miniforge-player'
        files[`${appRoot}/Contents/MacOS/${exeName}`] = playerBin
        files[`${appRoot}/Contents/Info.plist`] = strToU8(buildMacInfoPlist(cfg, exeName))
        for (const [path, data] of Object.entries(web.files)) {
          files[`${appRoot}/Contents/Resources/game/${path}`] = data
        }
        files[`${appRoot}/Contents/Resources/game/game.config.json`] = strToU8(gameConfigJson)
        files['README.txt'] = strToU8(
          `${safeName} v${cfg.version} (macOS Instant Export)\n\nUnzip and double-click ${safeName}.app.\nIf macOS Gatekeeper warns about an unsigned app, right-click -> Open or run:\n  chmod +x "${safeName}.app/Contents/MacOS/${exeName}"\n  xattr -dr com.apple.quarantine "${safeName}.app"\n`,
        )
      } else if (platform === 'windows') {
        files[`${safeName}.exe`] = playerBin
        for (const [path, data] of Object.entries(web.files)) {
          files[`game/${path}`] = data
        }
        files['game/game.config.json'] = strToU8(gameConfigJson)
        files['README.txt'] = strToU8(
          `${safeName} v${cfg.version} (Windows Instant Export)\n\nUnzip all files keeping the game/ folder next to ${safeName}.exe, then double-click ${safeName}.exe to play.\n`,
        )
      } else {
        const binName = safeName.replace(/\s+/g, '-')
        files[binName] = playerBin
        for (const [path, data] of Object.entries(web.files)) {
          files[`game/${path}`] = data
        }
        files['game/game.config.json'] = strToU8(gameConfigJson)
        files['README.txt'] = strToU8(
          `${safeName} v${cfg.version} (Linux Instant Export)\n\nUnzip all files keeping the game/ folder next to ${binName}, then run:\n  chmod +x "./${binName}" && "./${binName}"\n`,
        )
      }
      const zip = zipSync(files)
      return {
        blob: new Blob([Uint8Array.from(zip)], { type: 'application/zip' }),
        report: {
          profile: platform,
          artifact: 'Instant Executable (Export Template)',
          files: Object.keys(files),
          compressed: zip.length,
          game: web.report,
        },
      }
    }
  }

  // Mode 2: Complete Tauri v2 Source Build Project (fallback if template binary not present, or explicit Source mode)
  const target = platform === 'windows' ? 'nsis' : platform === 'macos' ? 'dmg' : 'deb'
  const bundleTargets = platform === 'macos' ? ['app', 'dmg'] : [target]
  const config = {
    productName: safeName,
    version: cfg.version || '1.0.0',
    identifier: cfg.identifier || 'dev.miniforge.game.' + project.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 55),
    build: { frontendDist: '../game' },
    app: {
      windows: [
        {
          label: 'game',
          title: cfg.appName || project.name,
          width: cfg.windowWidth || 1280,
          height: cfg.windowHeight || 720,
          fullscreen: Boolean(cfg.fullscreen),
          resizable: cfg.resizable !== false,
          decorations: cfg.decorated !== false,
        },
      ],
    },
    bundle: { active: true, targets: bundleTargets, icon: ['icons/icon.png', 'icons/icon.ico'] },
  }

  const files: Record<string, Uint8Array> = {}
  for (const [path, data] of Object.entries(web.files)) files['game/' + path] = data
  files['game/game.config.json'] = strToU8(gameConfigJson)

  const templateNote =
    cfg.desktopMode === 'template'
      ? '\nNOTE: Prebuilt Export Template binary was not found at ' +
        (cfg.templateBaseUrl || './export-templates/') +
        ', so a full Tauri source project was generated instead. Upload a prebuilt player binary in Export Settings for 1-second instant executables.\n'
      : ''

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
        scripts: { build: 'tauri build --bundles ' + bundleTargets.join(',') },
        devDependencies: { '@tauri-apps/cli': '2.12.5' },
      },
      null,
      2,
    ),
    'README.txt':
      (platform === 'windows'
        ? 'Windows: install Rust stable, MSVC C++ Build Tools, WebView2 and Node.js.'
        : platform === 'macos'
          ? 'macOS: install Xcode Command Line Tools (xcode-select --install), Rust stable and Node.js.'
          : 'Linux: install Rust stable, Node.js, WebKitGTK 4.1 development headers, librsvg2-dev, libayatana-appindicator3-dev and build-essential.') +
      '\nRun npm install and npm run build from this directory on the target OS.\nInstaller output: src-tauri/target/release/bundle/' +
      target +
      '/' +
      templateNote,
  }
  for (const [path, data] of Object.entries(source)) files[path] = strToU8(data)

  // Embed custom icon if provided in Export Settings, else fallback to default icons
  const customIconBytes = cfg.iconDataUrl ? dataUrlToUint8(cfg.iconDataUrl) : null
  for (const [name, url] of Object.entries({ 'icon.png': icon, 'icon.ico': windowsIcon })) {
    if (name === 'icon.png' && customIconBytes) {
      files['src-tauri/icons/' + name] = customIconBytes
      continue
    }
    const res = await fetch(url)
    if (!res.ok) throw Error('Cannot read application icon')
    files['src-tauri/icons/' + name] = new Uint8Array(await res.arrayBuffer())
  }

  const zip = zipSync(files)
  return {
    blob: new Blob([Uint8Array.from(zip)], { type: 'application/zip' }),
    report: {
      profile: platform,
      artifact: cfg.desktopMode === 'template' ? 'Tauri source fallback (template not found)' : 'Tauri build project',
      files: Object.keys(files),
      compressed: zip.length,
      game: web.report,
    },
  }
}
