import type { SteamInvoke, SteamUserInfo } from '../../runtime/src/steam'

const commands = new Set([
  'steam_unlock_achievement', 'steam_clear_achievement', 'steam_has_achievement',
  'steam_set_rich_presence', 'steam_clear_rich_presence',
  'steam_cloud_write', 'steam_cloud_read', 'steam_cloud_delete', 'steam_cloud_list',
  'steam_create_lobby', 'steam_list_lobbies', 'steam_join_lobby', 'steam_leave_lobby',
  'steam_set_lobby_data', 'steam_send_p2p', 'steam_poll_p2p', 'steam_relay_status',
  'steam_invite_friends', 'steam_read_stat', 'steam_write_stat', 'steam_is_dlc_installed',
])

interface DesktopWindow extends Window {
  __TAURI__?: { core?: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> } }
}

const desktopInvoke = () => (window as DesktopWindow).__TAURI__?.core?.invoke

export const canLaunchSteamPreview = () => typeof desktopInvoke() === 'function'

let previewIdle = Promise.resolve()

export async function openNativeSteamPreview(frame: HTMLIFrameElement, appId: number, signal?: AbortSignal) {
  const invoke = desktopInvoke()
  if (!invoke) throw new Error('Native Steam preview requires the Miniforge desktop editor.')
  const previousPreview = previewIdle
  let release!: () => void
  previewIdle = new Promise<void>(resolve => { release = resolve })
  let user: SteamUserInfo
  try {
    await previousPreview
    signal?.throwIfAborted()
    if (!await invoke<boolean>('steam_preview_supported').catch(() => false)) {
      throw new Error('Install a Miniforge desktop editor build with Steam preview support.')
    }
    user = await invoke<SteamUserInfo>('steam_init', { appId })
    if (!user?.native || !user.steamId || user.appId !== appId) throw new Error('Steam returned no matching account.')
  } catch (error) {
    release()
    throw new Error('Steam preview could not start. ' + (error instanceof Error ? error.message : String(error)))
  }

  const session = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-')
  const requests = new Set<Promise<void>>()
  let closed = false
  const onMessage = (event: MessageEvent) => {
    const target = frame.contentWindow
    if (!target || event.source !== target || event.origin !== 'null') return
    const { type, session: id, request, command, args } = event.data ?? {}
    if (type !== 'miniforge:steam-request' || id !== session || !Number.isSafeInteger(request)) return

    const reply = (value: unknown) => {
      if (!closed) target.postMessage({ type: 'miniforge:steam-response', session, request, value }, '*')
    }
    if (command === 'steam_init') {
      reply(args?.appId === appId ? user : null)
      return
    }
    if (!commands.has(command) || requests.size >= 64) {
      reply(null)
      return
    }
    const task = Promise.resolve().then(() => invoke(command, args)).then(reply, () => reply(null))
    requests.add(task)
    void task.then(() => requests.delete(task), () => requests.delete(task))
  }
  window.addEventListener('message', onMessage)
  return {
    session,
    close() {
      if (closed) return
      closed = true
      window.removeEventListener('message', onMessage)
      void Promise.allSettled(requests).then(() => invoke('steam_preview_end'))
        .catch(error => console.error('Steam preview cleanup failed', error))
        .finally(release)
    },
  }
}

export function createSteamPreviewInvoke(session: string): SteamInvoke {
  let sequence = 0
  return <T>(command: string, args?: Record<string, unknown>) => new Promise<T | null>((resolve) => {
    const request = ++sequence
    function receive(event: MessageEvent) {
      const data = event.data
      if (event.source !== window.parent || data?.type !== 'miniforge:steam-response' ||
        data.session !== session || data.request !== request) return
      finish(data.value)
    }
    function finish(value: T | null) {
      clearTimeout(timer)
      window.removeEventListener('message', receive)
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), 20_000)
    window.addEventListener('message', receive)
    window.parent.postMessage({ type: 'miniforge:steam-request', session, request, command, args }, '*')
  })
}
