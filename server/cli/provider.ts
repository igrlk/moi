import pc from './pc'
import { keyValue } from './ui'

// `moi <provider>` on its own lists the commands AND what they can be run
// against, so discovering the installable agents never requires `init`.
export function printProviderCommands(provider: string, argHint: string) {
  console.log('\n' + pc.bold('  Commands'))
  console.log(
    keyValue(
      [
        [
          pc.bold(`moi ${provider} init`) + ' ' + pc.dim(argHint),
          'Install Moi skills and register the workspace'
        ]
      ],
      '    '
    )
  )
}

// The argument is optional when there is exactly one candidate, so the hint
// should not demand one that isn't needed.
export function initHint(provider: string, count: number, label: string): string {
  return count === 1 ? `moi ${provider} init` : `moi ${provider} init <${label}>`
}
