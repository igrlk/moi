import { resolveUrl } from '@/lib/navigation'
import { defineCommand } from 'citty'
import { resolve } from 'path'
import { dirArg } from '../args'
import { sendControl } from '../control'
import pc from '../pc'

export const navigate = defineCommand({
  meta: {
    name: 'navigate',
    description: 'Navigate the last active browser showing this workspace'
  },
  args: {
    href: {
      type: 'positional',
      required: true,
      description: 'Workspace address, e.g. moi:/views/events?eventId=123'
    },
    dir: dirArg
  },
  run({ args }) {
    try {
      const href = resolveUrl(args.href)
      if (!href.startsWith('moi:/') || href.startsWith('moi:/files/'))
        throw new Error('Navigation needs a workspace page address')
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Invalid workspace address')
      process.exit(1)
    }
    const path = resolve(args.dir)
    sendControl(path, { type: 'navigate', path, href: args.href }, res => {
      console.log('\n' + pc.green('✓') + ' Navigated to ' + pc.bold(String(res.href)) + '\n')
    })
  }
})
