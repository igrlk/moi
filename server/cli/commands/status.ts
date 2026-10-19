import type { WorkspaceEntry } from '@/lib/types'
import { defineCommand } from 'citty'
import { CONTROL_HOST, CONTROL_PORT, CONTROL_URL, PORT } from '../../constants'
import type { ControlProbe } from '../../control-client'
import { controlFailureMessage, probeControlServer } from '../../control-client'
import { queryServerInfo } from '../../service'
import { staleSkillNotice } from '../../skills/version'
import { VERSION } from '../../version'
import pc from '../pc'
import { versionMismatchNotice } from '../server-version'

export const status = defineCommand({
  meta: { name: 'status', description: 'Show server status and registered workspaces' },
  async run() {
    const probe: ControlProbe = await probeControlServer()
    const notice = await staleSkillNotice(process.cwd())

    if (probe.status === 'not-running') {
      console.log('\n' + pc.dim('○') + ' Server is ' + pc.bold('not running'))
      console.log(pc.dim(`  cli version ${VERSION}`) + '\n')
      process.exit(0)
    }

    // The dial failed for a reason other than an empty port, so the server may
    // be up and healthy. Name the real obstacle instead of blaming the process.
    if (probe.status === 'unreachable') {
      console.log('\n' + pc.yellow('◆') + ' Server is ' + pc.bold('unreachable'))
      console.log(pc.dim(`  control port ${CONTROL_HOST}:${CONTROL_PORT} — ${probe.reason}`))
      console.log(pc.dim(`  cli version ${VERSION}`) + '\n')
      process.exit(1)
    }

    const info = await queryServerInfo()
    console.log(
      '\n' +
        pc.green('●') +
        ' Server is ' +
        pc.bold('running') +
        pc.dim(
          (info?.unixSocket
            ? `  (web socket: ${info.unixSocket}`
            : `  (http port: ${info?.port || PORT}`) +
            `, control port: ${CONTROL_PORT}` +
            (info?.pid ? `, pid: ${info.pid}` : '') +
            ')'
        )
    )
    if (info) {
      console.log(
        pc.dim(`  server version ${info.version}`) +
          (info.service ? pc.dim('  · service-managed (`moi service`)') : '')
      )
    }
    console.log(pc.dim(`  cli version    ${VERSION}`))
    const mismatch = info ? versionMismatchNotice(info.version) : null
    if (mismatch) console.log('\n' + mismatch)

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(CONTROL_URL)

      ws.onopen = () => ws.send(JSON.stringify({ type: 'workspace:list' }))

      ws.onmessage = event => {
        const res = JSON.parse(String(event.data))
        const workspaces: WorkspaceEntry[] = res.workspaces ?? []
        const n = workspaces.length
        console.log(pc.dim(`  ${n} workspace${n === 1 ? '' : 's'} registered\n`))

        ws.close()
        resolve()
      }

      ws.onerror = () =>
        void probeControlServer().then(p => reject(new Error(controlFailureMessage(p))))
    })

    if (notice) console.log(pc.yellow(notice) + '\n')
    process.exit(0)
  }
})
