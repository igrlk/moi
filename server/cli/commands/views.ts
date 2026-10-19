import { defineCommand } from 'citty'
import { resolve } from 'path'
import { CONTROL_URL } from '../../constants'
import { exitControlUnreachable } from '../control'
import pc from '../pc'

const viewsSet = defineCommand({
  meta: { name: 'set', description: 'Set a pending view’s title and icon' },
  args: {
    id: { type: 'positional', required: true, description: 'View id' },
    dir: {
      type: 'positional',
      default: '.',
      description: 'Workspace directory (default: current)'
    },
    title: { type: 'string', description: 'Display title' },
    icon: { type: 'string', description: 'App icon registry id' }
  },
  run({ args }) {
    const path = resolve(args.dir)
    const ws = new WebSocket(CONTROL_URL)
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: 'view:set',
          path,
          id: args.id,
          title: args.title,
          icon: args.icon
        })
      )
    ws.onmessage = event => {
      const result = JSON.parse(String(event.data))
      if (result.error) {
        console.error('\n' + pc.red(pc.bold('Error:')) + ' ' + result.error + '\n')
        ws.close()
        process.exit(1)
      }
      console.log(
        '\n' + pc.green('✓') + ' View updated ' + pc.bold(String(result.viewId ?? args.id)) + '\n'
      )
      ws.close()
      process.exit(0)
    }
    ws.onerror = () => void exitControlUnreachable()
  }
})

const viewsCreate = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a view, optionally forking a source chat to build it'
  },
  args: {
    dir: { type: 'positional', default: '.', description: 'Workspace directory' },
    'from-session': {
      type: 'string',
      description: 'Session id to fork into a new view chat'
    },
    requirements: { type: 'string', required: true, description: 'Complete view requirements' }
  },
  run({ args }) {
    const ws = new WebSocket(CONTROL_URL)
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: 'view:create',
          path: resolve(args.dir),
          fromSessionId: args['from-session'],
          requirements: args.requirements
        })
      )
    ws.onmessage = event => {
      const result: Record<string, unknown> = JSON.parse(String(event.data))
      console.log(JSON.stringify(result, null, 2))
      if (result.warning) console.error(result.warning)
      ws.close()
      process.exit(result.error ? 1 : 0)
    }
    ws.onerror = () => void exitControlUnreachable()
  }
})

export const views = defineCommand({
  meta: { name: 'views', description: 'Create views and set their build details' },
  subCommands: { create: viewsCreate, set: viewsSet }
})
