import { defineCommand } from 'citty'
import { existsSync } from 'node:fs'
import { join, resolve } from 'path'
import { resolveWorkspace } from '../../skills/version'
import { appletOnlyArg, readAppletSelector } from '../applet-selector'
import pc from '../pc'

export const check = defineCommand({
  meta: { name: 'check', description: 'Run applet checks' },
  args: {
    dir: {
      type: 'positional',
      default: '.',
      description: 'Workspace directory (default: current)'
    },
    only: appletOnlyArg
  },
  async run({ args }) {
    const only = readAppletSelector(args.only)
    const { root } = await resolveWorkspace(resolve(args.dir))
    if (!existsSync(join(root, '.moi'))) {
      console.error('\n' + pc.red('✗') + ` No Moi workspace found at ${root}\n`)
      process.exit(1)
    }
    const { formatAppletTypecheckDiagnostics, typecheckApplets } =
      await import('../../applets/typecheck')
    const result = await typecheckApplets(root, only)

    if (only?.includes('/') && result.files.length === 0) {
      console.error('\n' + pc.red('✗') + ` Applet "${only}" not found.\n`)
      process.exit(1)
    }

    if (result.diagnostics.length > 0) {
      console.error('\n' + pc.red('✗') + ' Applet check failed: TypeScript\n')
      console.error(formatAppletTypecheckDiagnostics(result.diagnostics))
      process.exit(1)
    }

    if (result.files.length === 0) {
      const scope = args.only ? `.moi/${args.only}` : '.moi/widgets or .moi/views'
      console.log('\n' + pc.green('✓') + ` No applet source files found in ${scope}\n`)
      return
    }

    const suffix = only ? ` (${only})` : ''
    console.log(
      '\n' +
        pc.green('✓') +
        ` Applet checks passed: TypeScript · ${result.files.length} file${result.files.length === 1 ? '' : 's'}${suffix}\n`
    )
  }
})
