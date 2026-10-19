import { appletSelectorMatches } from '@/lib/applet-selector'
import type { AppletLogEntry } from '@/lib/types'
import { defineCommand } from 'citty'
import { resolve } from 'path'
import { appletOnlyArg, readAppletSelector } from '../applet-selector'
import { dirArg } from '../args'
import { sendControl } from '../control'
import pc from '../pc'

// Compact relative age for a journal row: "just now", "4m ago", "2h ago", …
function agoLabel(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

// Where a journal entry points: the server function for rpc rows, else the applet.
function logSubject(e: {
  source: string
  kind?: string
  name?: string
  module?: string
  fn?: string
}): string {
  if (e.module) return `${e.module}/${e.fn ?? '?'}`
  if (e.name) return `${e.kind ?? 'applet'} ${e.name}`
  return 'unattributed'
}

const MAX_LOG_MESSAGE_LINES = 12

const debugLogs = defineCommand({
  meta: {
    name: 'logs',
    description: 'Applet runtime errors on record (load / render / rpc / build failures)'
  },
  args: {
    dir: dirArg,
    only: appletOnlyArg,
    json: {
      type: 'boolean',
      default: false,
      description: 'Machine-readable output, includes stacks and epoch timestamps'
    },
    clear: { type: 'boolean', default: false, description: 'Wipe the journal' }
  },
  run({ args }) {
    const only = readAppletSelector(args.only)
    const path = resolve(args.dir)
    if (args.clear) {
      if (only) {
        console.error('\n' + pc.red('✗') + ' Cannot combine --only with --clear.\n')
        process.exit(1)
      }
      sendControl(path, { type: 'debug:logs', path, clear: true }, res => {
        console.log('\n' + pc.green('✓') + ` cleared ${res.cleared ?? 0} entries\n`)
      })
      return
    }
    sendControl(path, { type: 'debug:logs', path }, res => {
      let entries = (Array.isArray(res.entries) ? res.entries : []) as AppletLogEntry[]
      if (only) {
        entries = entries.filter(
          entry =>
            entry.kind &&
            entry.name &&
            appletSelectorMatches(only, entry.kind === 'widget' ? 'widgets' : 'views', entry.name)
        )
      }
      if (args.json) {
        console.log(JSON.stringify(entries, null, 2))
        return
      }
      if (entries.length === 0) {
        const suffix = only ? ` for ${only}` : ''
        console.log(
          '\n' + pc.bold('moi debug logs') + pc.dim(` — no applet errors on record${suffix}`) + '\n'
        )
        return
      }
      const suffix = only ? ` for ${only}` : ''
      console.log(
        '\n' +
          pc.bold('moi debug logs') +
          pc.dim(` — ${entries.length} error(s) on record${suffix}`) +
          '\n'
      )
      for (const e of entries) {
        const count = e.count > 1 ? pc.dim(` ×${e.count}`) : ''
        console.log(
          `  ${pc.dim(agoLabel(e.ts).padEnd(10))} ${e.source.padEnd(7)} ${pc.bold(logSubject(e))}${count}`
        )
        const lines = e.message.split('\n')
        for (const line of lines.slice(0, MAX_LOG_MESSAGE_LINES)) {
          console.log('    ' + line)
        }
        if (lines.length > MAX_LOG_MESSAGE_LINES) {
          console.log(pc.dim(`    … ${lines.length - MAX_LOG_MESSAGE_LINES} more lines (--json)`))
        }
        console.log()
      }
      console.log(
        pc.dim('  Entries clear when their applet next builds successfully, or via --clear.') + '\n'
      )
    })
  }
})

// Experimental workspace-debugging toolbox. One subcommand for now (`logs`);
// more introspection (worker state, RPC traces, …) may hang off it later.
export const debug = defineCommand({
  meta: {
    name: 'debug',
    description: 'Debug the workspace (experimental) — `moi debug logs` for applet errors'
  },
  subCommands: { logs: debugLogs }
})
