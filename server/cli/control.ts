import { accessSync, constants } from 'node:fs'
import { CONTROL_URL } from '../constants'
import { controlFailureMessage, probeControlServer } from '../control-client'
import { staleSkillNotice } from '../skills/version'
import pc from './pc'

export async function isServerRunning(): Promise<boolean> {
  return (await probeControlServer()).status === 'running'
}

// Print why the control socket could not be opened, then exit. Classifies the
// failure first, so "no server is listening" and "the server is up but the
// address is unreachable" no longer read as the same problem.
export async function exitControlUnreachable(): Promise<never> {
  console.error(controlFailureMessage(await probeControlServer()))
  process.exit(1)
}

export async function waitForServer(timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isServerRunning()) return true
    await Bun.sleep(200)
  }
  return false
}

export async function registerViaControl(absPath: string): Promise<string> {
  try {
    accessSync(absPath, constants.R_OK | constants.W_OK | constants.X_OK)
  } catch {
    console.error('\n' + pc.red('✗') + ` Can't open ${absPath} for reading and writing\n`)
    process.exit(1)
  }
  return new Promise((res, rej) => {
    const ws = new WebSocket(CONTROL_URL)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'workspace:register', path: absPath }))
    ws.onmessage = event => {
      const data = JSON.parse(String(event.data))
      if (data.id) {
        ws.close()
        res(data.id)
      }
    }
    ws.onerror = () => void probeControlServer().then(p => rej(new Error(controlFailureMessage(p))))
  })
}

// Round-trip one request through the control port and hand the reply to
// `onResult`. Mirrors the `bundle`/`theme` commands: one socket per invocation,
// print, exit. Shared by `scratch`, `call-server-fn`, and `debug logs`.
export function sendControl(
  path: string,
  payload: Record<string, unknown>,
  onResult: (res: Record<string, unknown>) => void | Promise<void>
) {
  const ws = new WebSocket(CONTROL_URL)
  let connected = false
  let responded = false
  ws.onopen = () => {
    connected = true
    ws.send(JSON.stringify(payload))
  }
  ws.onmessage = async event => {
    responded = true
    const res = JSON.parse(String(event.data))
    if (res.error) {
      console.error('\n' + pc.red('✗') + ' ' + res.error + '\n')
      ws.close()
      process.exit(1)
    }
    await onResult(res)
    // The stale-skill notice rides on stderr so it never corrupts a command's
    // structured stdout (read's JSON, view's PNG path) while the agent still sees it.
    const notice = await staleSkillNotice(path)
    if (notice) console.error('\n' + pc.yellow(notice) + '\n')
    ws.close()
    process.exit(0)
  }
  ws.onclose = () => {
    if (connected && !responded) {
      console.error(
        'The server disconnected before acknowledging the command. Check the browser before retrying.'
      )
      process.exit(1)
    }
  }
  ws.onerror = () => void exitControlUnreachable()
}
