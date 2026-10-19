import { defineCommand } from 'citty'
import { resolve } from 'path'
import { CONTROL_URL } from '../../constants'
import { staleSkillNotice } from '../../skills/version'
import { appletOnlyArg, readAppletSelector } from '../applet-selector'
import { exitControlUnreachable } from '../control'
import pc from '../pc'
import { columns } from '../ui'

function colorStatus(status: string) {
  if (status === 'built') return pc.green(status)
  if (status === 'failed') return pc.red(status)
  return pc.dim(status)
}

export const bundle = defineCommand({
  meta: { name: 'bundle', description: 'Rebuild changed widgets and views' },
  args: {
    dir: {
      type: 'positional',
      default: '.',
      description: 'Workspace directory (default: current)'
    },
    force: {
      type: 'boolean',
      description: 'Rebuild the selected applets, ignoring file modification times',
      default: false
    },
    only: appletOnlyArg
  },
  async run({ args }) {
    const only = readAppletSelector(args.only)
    const path = resolve(args.dir)
    // Computed locally up front so it can ride along in the success output; the
    // agent reads this and knows to run `moi skill update`.
    const notice = await staleSkillNotice(path)
    const ws = new WebSocket(CONTROL_URL)

    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: 'bundle',
          path,
          force: args.force,
          only
        })
      )

    ws.onmessage = event => {
      const res = JSON.parse(String(event.data))

      // The server fails loudly when the path isn't inside a registered
      // workspace (e.g. run from an unrelated dir) instead of silently no-op'ing.
      if (res.error) {
        console.error('\n' + pc.red(pc.bold('Error:')) + ' ' + res.error + '\n')
        ws.close()
        process.exit(1)
      }

      type Row = { kind?: string; name: string; status: string; error?: string }
      const results: Row[] = Array.isArray(res.results) ? res.results : []
      const where = typeof res.workspacePath === 'string' ? res.workspacePath : path

      // Empty here means a *real* workspace with no widgets/views — not the old
      // "wrong dir" footgun (that's an error above now). Say so plainly.
      if (results.length === 0) {
        console.log(
          '\n' +
            pc.bold('moi bundle') +
            pc.dim(' — nothing to build') +
            '\n\n' +
            pc.dim(`  No widgets or views found in ${where}/.moi/`) +
            '\n'
        )
        if (notice) console.log(pc.yellow(notice) + '\n')
        ws.close()
        process.exit(0)
      }

      const counts: Record<string, number> = {}
      for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1
      const summary = ['built', 'skipped', 'failed']
        .filter(s => counts[s])
        .map(s => `${counts[s]} ${s}`)
        .join(' · ')

      console.log('\n' + pc.bold('moi bundle') + pc.dim(` — ${summary}`) + '\n')
      console.log(
        columns(
          ['kind', 'name', 'status'].map(h => pc.dim(h)),
          results.map(r => [pc.dim(r.kind ?? ''), r.name, colorStatus(r.status)])
        )
      )

      const failed = results.filter(r => r.status === 'failed')
      console.log()
      for (const f of failed) {
        console.log(pc.red(pc.bold(f.name + ':')))
        console.log('  ' + f.error + '\n')
      }

      // Runtime errors still standing after the rebuild's clear-on-success
      // sweep — point the agent at the journal while it's paying attention.
      const logCount = typeof res.logCount === 'number' ? res.logCount : 0
      if (logCount > 0) {
        console.log(
          pc.yellow(`ℹ ${logCount} applet runtime error(s) on record — run \`moi debug logs\`.`) +
            '\n'
        )
      }

      if (notice) console.log(pc.yellow(notice) + '\n')
      ws.close()
      process.exit(failed.length > 0 ? 1 : 0)
    }

    ws.onerror = () => void exitControlUnreachable()
  }
})
