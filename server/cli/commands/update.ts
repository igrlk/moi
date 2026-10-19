import { defineCommand } from 'citty'
import { analyzeInstall, queryServerInfo, restartService } from '../../service'
import {
  detectPackageManager,
  fetchLatestVersion,
  installedBinVersion,
  isNewer,
  manualUpdateLines,
  runPackageManager,
  updateArgv
} from '../../update'
import { isPrerelease, VERSION } from '../../version'
import { isServerRunning } from '../control'
import pc from '../pc'

export const update = defineCommand({
  meta: {
    name: 'update',
    description: 'Update Moi to the latest published version'
  },
  args: {
    check: {
      type: 'boolean',
      default: false,
      description:
        'Only check the registry, change nothing. Exit 0: up to date (or nothing to update), 1: update available, 2: check failed.'
    }
  },
  async run({ args }) {
    // A checkout has no owning package manager — updating means `git pull`.
    const analysis = analyzeInstall()
    if (analysis.kind === 'checkout') {
      console.log(
        '\n' +
          pc.yellow('◆') +
          ` This Moi runs from a source tree (${analysis.reason}) — update it with git instead.\n`
      )
      process.exit(0)
    }

    console.log('\n' + pc.bold('moi update') + pc.dim(` — installed v${VERSION}`))

    if (isPrerelease(VERSION)) {
      console.log(
        '\n' +
          pc.yellow('◆') +
          ' Prerelease installs are updated manually — pick the tag you want:\n' +
          pc.dim('  bun i -g moi-computer@next   (or @latest to leave the prerelease)\n')
      )
      process.exit(0)
    }

    let latest: string
    try {
      latest = await fetchLatestVersion()
    } catch (err) {
      console.error(
        '\n' + pc.red('✗') + ' ' + (err instanceof Error ? err.message : String(err)) + '\n'
      )
      // Under --check, exit 2 keeps "check failed" distinct from "update
      // available" (exit 1) for scripts and agents.
      process.exit(args.check ? 2 : 1)
    }

    if (!isNewer(latest, VERSION)) {
      console.log(pc.green('✓') + ` Already up to date (latest is v${latest})`)
      // --check is side-effect-free: skip the server sync, which can restart
      // a lagging service. `moi status` reports that lag without acting on it.
      if (!args.check) await reportServerFreshness()
      process.exit(0)
    }

    if (args.check) {
      console.log(
        `  update available: ${pc.bold('v' + latest)}` + pc.dim(' — run `moi update` to install\n')
      )
      process.exit(1)
    }

    console.log(`  latest is ${pc.bold('v' + latest)} — updating`)

    const pm = await detectPackageManager()
    if (!pm) {
      console.error(
        '\n' +
          pc.red('✗') +
          ' Could not tell which package manager owns this install' +
          pc.dim(` (${analysis.root})`) +
          '.\n  Update it yourself with the one you installed Moi with:\n' +
          manualUpdateLines(latest)
            .map(l => pc.dim('    ' + l))
            .join('\n') +
          '\n'
      )
      process.exit(1)
    }

    const argv = updateArgv(pm, latest)
    console.log(pc.dim(`  via ${pm}: ${argv.join(' ')}\n`))
    const code = await runPackageManager(argv)
    if (code !== 0) {
      console.error('\n' + pc.red('✗') + ` ${pm} exited with code ${code}.`)
      console.error(pc.dim('  Run it manually: ') + argv.join(' '))
      if (pm === 'npm') {
        console.error(
          pc.dim(
            '  If it failed with EACCES, your npm prefix is root-owned — fix ownership or use a user-level prefix.'
          )
        )
      }
      console.error()
      process.exit(1)
    }

    // Trust but verify: ask the bin users actually run what version it is now.
    // A stale answer means the update landed somewhere PATH does not point.
    const binVersion = analysis.kind === 'global' ? await installedBinVersion(analysis.bin) : null
    if (binVersion === latest) {
      console.log('\n' + pc.green('✓') + ` Moi updated to ${pc.bold('v' + latest)}`)
    } else if (binVersion) {
      console.log(
        '\n' +
          pc.yellow('⚠') +
          ` ${pm} finished, but \`moi\` on PATH reports v${binVersion} (expected v${latest}).` +
          '\n' +
          pc.dim('  Another install may shadow the updated one — check `which moi`.')
      )
    } else {
      console.log('\n' + pc.green('✓') + ` ${pm} finished (v${latest})`)
    }

    await reportServerFreshness(latest)
    console.log()
    process.exit(0)
  }
})

// After an update (or an up-to-date check), bring the running server along:
// restart a service-managed one and verify the version it comes back with; a
// foreground server in someone's terminal only ever gets a warning.
async function reportServerFreshness(expected?: string) {
  const running = await isServerRunning()
  if (!running) return
  const info = await queryServerInfo()
  if (!info) {
    console.log(
      pc.yellow('⚠') +
        ' A server is running but too old to report its version — restart it to finish the update.'
    )
    return
  }
  const target = expected ?? VERSION
  if (info.version === target) {
    if (expected) console.log(pc.green('✓') + ` Server already on v${info.version}`)
    return
  }
  if (info.service) {
    console.log(pc.dim(`  restarting the service (server was v${info.version})…`))
    try {
      const fresh = await restartService()
      if (fresh && fresh.version === target) {
        console.log(pc.green('✓') + ` Service restarted on ${pc.bold('v' + fresh.version)}`)
      } else if (fresh) {
        console.log(
          pc.yellow('⚠') +
            ` Service restarted but reports v${fresh.version} (expected v${target}).` +
            '\n' +
            pc.dim('  The unit may exec a different install — see `moi service`.')
        )
      } else {
        console.log(
          pc.yellow('⚠') +
            ' Service restarted but the server has not come back up — `moi service logs`.'
        )
      }
    } catch (err) {
      console.log(
        pc.yellow('⚠') +
          ' Could not restart the service: ' +
          (err instanceof Error ? err.message : String(err))
      )
    }
    return
  }
  console.log(
    pc.yellow('⚠') +
      ` A foreground server is still running v${info.version}` +
      (info.pid ? pc.dim(` (pid ${info.pid})`) : '') +
      '.\n' +
      pc.dim(`  Restart it when convenient (Ctrl-C, then \`moi start\`) to get v${target}.`)
  )
}
