import type { AppletSelector } from '@/lib/applet-selector'
import { parseAppletSelector } from '@/lib/applet-selector'
import pc from './pc'

export const appletOnlyArg = {
  type: 'string' as const,
  description: 'Limit to "widgets", "views", "widgets/<id>", or "views/<id>"'
}

export function readAppletSelector(value: string | undefined): AppletSelector | undefined {
  if (value === undefined) return undefined
  if (parseAppletSelector(value)) return value as AppletSelector
  console.error(
    '\n' +
      pc.red('✗') +
      ` Invalid --only value "${value}" — use "widgets", "views", "widgets/<id>", or "views/<id>".\n`
  )
  process.exit(1)
}
