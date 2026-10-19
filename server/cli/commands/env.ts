import { defineCommand } from 'citty'
import { isValidEnvKey } from '../../workspaces/env'
import {
  execWithEnv,
  readEnvView,
  readSecretValue,
  renderEnvView,
  resolveCwdWorkspace,
  writeEnv
} from '../env'
import pc from '../pc'

function envFail(message: string): never {
  console.error('\n' + pc.red('✗') + ' ' + message + '\n')
  process.exit(1)
}

const envSet = defineCommand({
  meta: {
    name: 'set',
    description:
      'Set custom secrets: `moi env set KEY=value [KEY=value...]`, or `moi env set KEY` to read one value from stdin'
  },
  args: {
    key: {
      type: 'positional',
      required: true,
      description: 'KEY=value pair(s), or a single bare KEY to read the value from stdin'
    }
  },
  async run({ args }) {
    const entry = await resolveCwdWorkspace()
    const pairs = args._
    const set: Record<string, string> = {}

    if (pairs.length === 1 && !pairs[0].includes('=')) {
      // Bare-KEY form: one key, value from stdin (hidden prompt on a TTY).
      const key = pairs[0]
      if (!isValidEnvKey(key)) envFail(`Invalid env key: ${key}`)
      let value: string
      try {
        value = await readSecretValue(key)
      } catch {
        // Ctrl-C at the hidden prompt.
        process.exit(1)
      }
      // An empty value is almost always an unset variable on the piping side —
      // storing '' would silently shadow a real .env value with nothing.
      if (value === '')
        envFail(`Empty value for ${key} — pipe a non-empty value or pass ${key}=value`)
      set[key] = value
    } else {
      for (const pair of pairs) {
        const eq = pair.indexOf('=')
        if (eq === -1) {
          envFail(
            `Missing value for ${pair} — use KEY=value (bare KEY reads stdin only when set alone)`
          )
        }
        const key = pair.slice(0, eq)
        const value = pair.slice(eq + 1)
        if (!isValidEnvKey(key)) envFail(`Invalid env key: ${key}`)
        if (value === '')
          envFail(`Empty value for ${key} — use \`moi env unset ${key}\` to remove a key`)
        set[key] = value
      }
    }

    const backend = await writeEnv(entry.path, { set })
    for (const key of Object.keys(set)) {
      console.log(pc.green('✓') + ` Set ${pc.bold(key)} ${pc.dim('(custom)')}`)
    }
    // A plaintext fallback should never go unnoticed at write time.
    if (backend === 'file') {
      console.log(pc.dim('  Stored in a 0600 file — OS keychain unavailable.'))
    }
    process.exit(0)
  }
})

const envUnset = defineCommand({
  meta: { name: 'unset', description: 'Remove custom secrets: `moi env unset KEY [KEY...]`' },
  args: {
    key: { type: 'positional', required: true, description: 'Key(s) to remove' }
  },
  async run({ args }) {
    const entry = await resolveCwdWorkspace()
    const view = await readEnvView(entry.path)
    const byKey = new Map(view.vars.map(v => [v.key, v]))

    // Only custom secrets are removable; a dotenv-sourced key lives in its file.
    const removable: string[] = []
    let hadError = false
    for (const key of args._) {
      const v = byKey.get(key)
      if (!v) {
        console.warn(pc.yellow('!') + ` ${key} is not set — skipping`)
        continue
      }
      if (v.source === 'dotenv') {
        console.error(
          pc.red('✗') +
            ` ${key} comes from ${(v.files ?? []).join(', ')} — edit that file instead` +
            pc.dim(' (moi env unset only removes custom secrets)')
        )
        hadError = true
        continue
      }
      removable.push(key)
    }

    if (removable.length > 0) {
      await writeEnv(entry.path, { remove: removable })
      for (const key of removable) {
        const v = byKey.get(key)
        const unshadow =
          v?.source === 'both' ? pc.dim(` (falls back to ${(v.files ?? []).join(', ')})`) : ''
        console.log(pc.green('✓') + ` Removed ${pc.bold(key)}${unshadow}`)
      }
    }
    process.exit(hadError ? 1 : 0)
  }
})

const envExec = defineCommand({
  meta: {
    name: 'exec',
    description: 'Run a command with the workspace env: `moi env exec -- <cmd> [args...]`'
  },
  async run({ rawArgs }) {
    // Everything after `--` is the child command, untouched by flag parsing.
    const sep = rawArgs.indexOf('--')
    const cmd = sep === -1 ? [] : rawArgs.slice(sep + 1)
    if (cmd.length === 0) {
      console.error('\n' + pc.red('✗') + ' Usage: moi env exec -- <cmd> [args...]\n')
      process.exit(1)
    }
    const entry = await resolveCwdWorkspace()
    process.exit(await execWithEnv(entry.path, cmd))
  }
})

const envSubCommands = { set: envSet, unset: envUnset, exec: envExec }

export const env = defineCommand({
  meta: {
    name: 'env',
    description: 'Show the workspace env (key names only — never values)'
  },
  subCommands: envSubCommands,
  async run({ rawArgs }) {
    // citty invokes the parent run even after dispatching a subcommand — only
    // render the table when no subcommand ran. Object.hasOwn so prototype
    // names ('constructor', 'toString') never count as a dispatched command.
    const first = rawArgs.find(a => !a.startsWith('-'))
    if (first && Object.hasOwn(envSubCommands, first)) return
    const entry = await resolveCwdWorkspace()
    const view = await readEnvView(entry.path)
    console.log('\n' + renderEnvView(entry, view) + '\n')
    process.exit(0)
  }
})
