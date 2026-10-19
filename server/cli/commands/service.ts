import { defineCommand } from 'citty'
import { existsSync } from 'node:fs'
import { dirname } from 'path'
import {
  analyzeInstall,
  captureServiceEnv,
  installService,
  queryServerInfo,
  restartService,
  ServiceError,
  serviceLogPath,
  serviceStatus,
  uninstallService,
  webAddress
} from '../../service'
import { isServerRunning } from '../control'
import pc from '../pc'
import { versionMismatchNotice } from '../server-version'

function serviceFail(err: unknown): never {
  const message = err instanceof ServiceError ? err.message : String(err)
  console.error('\n' + pc.red('✗') + ' ' + message + '\n')
  process.exit(1)
}

// Shared success line after install/restart: did the server actually come up,
// and on which version?
function printServiceServer(info: Awaited<ReturnType<typeof queryServerInfo>>) {
  if (info) {
    console.log(
      '  server   ' +
        pc.bold(`v${info.version}`) +
        ` running on ${webAddress(info)}` +
        pc.dim(` (pid ${info.pid})`)
    )
    const mismatch = versionMismatchNotice(info.version)
    if (mismatch) console.log('\n' + mismatch)
  } else {
    console.log(
      '  ' +
        pc.yellow('server did not come up — check `moi service logs`') +
        pc.dim(' (it may still be starting)')
    )
  }
}

const serviceInstall = defineCommand({
  meta: {
    name: 'install',
    description: 'Install and start the user service (launchd on macOS, systemd on Linux)'
  },
  args: {
    port: { type: 'string', description: 'HTTP port for the service server (default: 13337)' },
    env: {
      type: 'string',
      description:
        'Extra env var names to capture from this shell, comma-separated (e.g. --env MY_TOKEN,OTHER)'
    }
  },
  async run({ args }) {
    // Check the install shape first: telling someone to stop their server only
    // to then refuse the checkout would be a pointless round-trip.
    const analysis = analyzeInstall()
    if (analysis.kind !== 'global') {
      try {
        await installService() // throws the precise refusal for this analysis
      } catch (err) {
        serviceFail(err)
      }
    }
    const port = args.port ? Number(args.port) : undefined
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      serviceFail(new ServiceError(`Invalid --port value "${args.port}" — use a port number.`))
    }
    // citty hands back an array when the flag repeats — accept both shapes.
    const envArg = Array.isArray(args.env) ? args.env.join(',') : args.env
    const extraEnv = (envArg ?? '')
      .split(',')
      .map(k => k.trim())
      .filter(Boolean)
    const serviceEnv = captureServiceEnv(process.env, dirname(process.execPath), extraEnv)
    const missingEnv = extraEnv.filter(key => !(key in serviceEnv))
    if (missingEnv.length > 0) {
      serviceFail(
        new ServiceError(
          `--env ${missingEnv.join(', ')}: not set in this shell (or the value is not capturable).`
        )
      )
    }
    // A foreground `moi start` holds the same ports the service needs. Refuse
    // rather than install a unit that instantly fails on bind.
    const runningInfo = await queryServerInfo()
    const foreground = (await isServerRunning()) && !runningInfo?.service
    if (foreground) {
      serviceFail(
        new ServiceError(
          'A foreground server is running' +
            (runningInfo?.pid ? ` (pid ${runningInfo.pid})` : '') +
            '.\n  Stop it (Ctrl-C in its terminal), then rerun `moi service install`.'
        )
      )
    }
    try {
      const result = await installService({ port, extraEnv })
      console.log(
        '\n' +
          pc.green('✓') +
          ' Service installed ' +
          pc.dim(`(${process.platform === 'darwin' ? 'launchd' : 'systemd user unit'})`)
      )
      console.log('  unit     ' + pc.dim(tildifyPath(result.unitPath)))
      if (result.logPath) console.log('  logs     ' + pc.dim(tildifyPath(result.logPath)))
      printServiceServer(result.info)
      console.log(pc.dim('\n  Starts on login, restarts on crash, survives reboots.'))
      for (const note of result.notes) console.log(pc.yellow('  ' + note))
      console.log()
    } catch (err) {
      serviceFail(err)
    }
  }
})

const serviceUninstall = defineCommand({
  meta: { name: 'uninstall', description: 'Stop the service and remove its unit' },
  async run() {
    try {
      const { unitPath, existed } = await uninstallService()
      if (!existed) {
        console.log(
          '\n' +
            pc.dim('○') +
            ' Service is not installed ' +
            pc.dim(`(${tildifyPath(unitPath)})`) +
            '\n'
        )
        return
      }
      console.log(
        '\n' + pc.green('✓') + ' Service removed ' + pc.dim(`(${tildifyPath(unitPath)})`) + '\n'
      )
    } catch (err) {
      serviceFail(err)
    }
  }
})

const serviceRestart = defineCommand({
  meta: { name: 'restart', description: 'Restart the service server' },
  async run() {
    try {
      const info = await restartService()
      console.log('\n' + pc.green('✓') + ' Service restarted')
      printServiceServer(info)
      console.log()
    } catch (err) {
      serviceFail(err)
    }
  }
})

const serviceLogs = defineCommand({
  meta: { name: 'logs', description: 'Show server logs (journalctl on Linux, log file on macOS)' },
  args: {
    lines: { type: 'string', default: '80', description: 'How many trailing lines to show' },
    follow: {
      type: 'boolean',
      alias: 'f',
      default: false,
      description: 'Keep following new output'
    }
  },
  async run({ args }) {
    const n = Math.max(1, Number(args.lines) || 80)
    if (process.platform === 'linux') {
      // journald owns the log (bounded, rotated). Inherit stdio so -f streams.
      const argv = ['journalctl', '--user', '-u', 'moi.service', '-n', String(n), '--no-pager']
      if (args.follow) argv.push('-f')
      const proc = Bun.spawn(argv, { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
      process.exit(await proc.exited)
    }
    const logPath = serviceLogPath()
    if (!existsSync(logPath)) {
      console.log('\n' + pc.dim('○') + ' No logs yet ' + pc.dim(`(${tildifyPath(logPath)})`) + '\n')
      process.exit(0)
    }
    console.error(pc.dim(tildifyPath(logPath)))
    const proc = Bun.spawn(['tail', '-n', String(n), ...(args.follow ? ['-F'] : []), logPath], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit'
    })
    process.exit(await proc.exited)
  }
})

function tildifyPath(p: string): string {
  const home = process.env.HOME
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p
}

async function runServiceStatus() {
  try {
    const s = await serviceStatus()
    const flavor = s.platform === 'darwin' ? 'launchd user agent' : 'systemd user unit'
    console.log('\n' + pc.bold('moi service') + pc.dim(` — ${flavor}`))
    console.log()
    if (!s.installed) {
      console.log('  ' + pc.dim('○') + ' Not installed')
      console.log(
        pc.dim('    Run `moi service install` to start Moi on login and keep it running.')
      )
      console.log()
      process.exit(0)
    }
    const rt = s.runtime
    const stateLabel =
      rt === null
        ? pc.dim('unknown')
        : rt.state === 'running'
          ? pc.green('● running') + (rt.pid ? pc.dim(` (pid ${rt.pid})`) : '')
          : rt.state === 'failed'
            ? pc.red('✗ failed') + pc.dim(rt.detail ? ` (${rt.detail})` : '')
            : rt.state === 'unavailable'
              ? pc.yellow('? unavailable') + pc.dim(rt.detail ? ` — ${rt.detail}` : '')
              : pc.dim('○ ' + rt.state)
    console.log('  state    ' + stateLabel)
    console.log('  unit     ' + pc.dim(tildifyPath(s.unitPath)))
    if (s.logPath)
      console.log('  logs     ' + pc.dim(tildifyPath(s.logPath)) + pc.dim('  (`moi service logs`)'))
    else
      console.log('  logs     ' + pc.dim('journalctl --user -u moi.service  (`moi service logs`)'))
    const info = await queryServerInfo()
    if (info) {
      console.log(
        '  server   ' +
          pc.bold(`v${info.version}`) +
          pc.dim(` on ${webAddress(info)} (pid ${info.pid})`)
      )
      if (!info.service) {
        console.log(
          pc.yellow('  ⚠ The running server is a foreground `moi start`, not the service.')
        )
      }
    } else if (rt?.state === 'running') {
      console.log('  server   ' + pc.yellow('unreachable on the control port'))
    }
    console.log()
    if (s.binMissing && s.bin) {
      console.log(
        pc.yellow(`  ⚠ The service execs ${s.bin}, which no longer exists`) +
          pc.dim(' (Moi moved or was reinstalled elsewhere).') +
          '\n' +
          pc.dim('    Rerun `moi service install` to re-capture paths.')
      )
    }
    if (s.bunMissing) {
      console.log(
        pc.yellow('  ⚠ No bun on the service PATH — the server cannot start.') +
          '\n' +
          pc.dim('    Reinstall bun, then rerun `moi service install`.')
      )
    }
    if (s.linger === 'disabled') {
      console.log(
        pc.yellow('  ⚠ Lingering is off — the service stops when your last session ends.') +
          '\n' +
          pc.dim('    Enable: loginctl enable-linger')
      )
    }
    const mismatch = info ? versionMismatchNotice(info.version) : null
    if (mismatch) console.log(mismatch.replace(/^/gm, '  ').replace(/^ {2}⚠/, '  ⚠') + '\n')
    process.exit(0)
  } catch (err) {
    serviceFail(err)
  }
}

const serviceSubCommands = {
  install: serviceInstall,
  uninstall: serviceUninstall,
  restart: serviceRestart,
  logs: serviceLogs
}

export const service = defineCommand({
  meta: {
    name: 'service',
    description: 'Run Moi as a user service: `moi service install|uninstall|restart|logs`'
  },
  subCommands: serviceSubCommands,
  async run({ rawArgs }) {
    // citty invokes the parent run even after dispatching a subcommand — only
    // show status when none ran (same pattern as `moi env` / `moi tabs`).
    const sub = rawArgs.find(a => !a.startsWith('-'))
    if (sub && Object.hasOwn(serviceSubCommands, sub)) return
    await runServiceStatus()
  }
})
