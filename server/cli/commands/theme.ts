import type { AgentTheme, ColorTheme, FontTheme, RadiusTheme } from '@/lib/themes'
import {
  AGENT_THEMES,
  COLOR_THEMES,
  DEFAULT_WORKSPACE_THEME,
  deriveThemeColors,
  FONT_THEMES,
  RADIUS_THEMES
} from '@/lib/themes'
import { defineCommand } from 'citty'
import { formatHex } from 'culori'
import { resolve } from 'path'
import { CONTROL_URL } from '../../constants'
import { staleSkillNotice } from '../../skills/version'
import { exitControlUnreachable } from '../control'
import pc from '../pc'
import { columns } from '../ui'

function swatchHexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

// Truecolor swatch using raw ANSI 24-bit escapes (picocolors maxes at 8 colors).
// Falls back to blank spaces when stdout is not a TTY, keeping piped output clean.
function swatch(bg?: string, fg?: string): string {
  if (!process.stdout.isTTY || !bg) return '    '
  const [br, bgg, bb] = swatchHexToRgb(bg)
  const [fr, fgg, fb] = swatchHexToRgb(fg ?? '#000000')
  return `\x1b[48;2;${br};${bgg};${bb}m\x1b[38;2;${fr};${fgg};${fb}m Aa \x1b[0m`
}

function themeSwatch(primary?: string): string {
  if (!primary) return swatch()
  const colors = deriveThemeColors(primary)
  return swatch(formatHex(colors.primary), formatHex(colors.primaryForeground))
}

export const theme = defineCommand({
  meta: { name: 'theme', description: 'Show or set the workspace appearance' },
  args: {
    dir: {
      type: 'positional',
      default: '.',
      description: 'Workspace directory (default: current)'
    },
    font: { type: 'string', description: 'Font theme key to apply' },
    color: { type: 'string', description: 'Color preset key to apply' },
    radius: { type: 'string', description: 'Radius preset key to apply' },
    agent: { type: 'string', description: 'Agent preset key to apply' }
  },
  async run({ args }) {
    const path = resolve(args.dir)
    const notice = await staleSkillNotice(path)
    const ws = new WebSocket(CONTROL_URL)

    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: 'theme',
          path,
          font: args.font ?? null,
          color: args.color ?? null,
          radius: args.radius ?? null,
          agent: args.agent ?? null
        })
      )

    ws.onmessage = event => {
      const res = JSON.parse(String(event.data))

      if (res.error) {
        console.error('\n' + pc.red(pc.bold('Error:')) + ' ' + res.error + '\n')
        ws.close()
        process.exit(1)
      }

      if (res.ok) {
        console.log()
        if (res.font) {
          const config = FONT_THEMES[res.font as FontTheme]
          console.log(
            pc.green('✓') +
              ' Font set to ' +
              pc.bold(config.label) +
              pc.dim(` (${config.sans} / ${config.mono})`)
          )
        }
        if (res.color) {
          const preset = COLOR_THEMES[res.color as ColorTheme]
          const chip = themeSwatch(preset.primary)
          console.log(pc.green('✓') + ' Color set to ' + pc.bold(preset.label) + ' ' + chip)
        }
        if (res.radius) {
          const preset = RADIUS_THEMES[res.radius as RadiusTheme]
          console.log(pc.green('✓') + ' Radius set to ' + pc.bold(preset.label))
        }
        if (res.agent) {
          const preset = AGENT_THEMES[res.agent as AgentTheme]
          console.log(pc.green('✓') + ' Agent set to ' + pc.bold(preset.label))
        }
        console.log()
        if (notice) console.log(pc.yellow(notice) + '\n')
        ws.close()
        process.exit(0)
      }

      const currentFont: FontTheme = res.currentFont ?? DEFAULT_WORKSPACE_THEME.font
      const currentColor: ColorTheme = res.currentColor ?? DEFAULT_WORKSPACE_THEME.color
      const currentRadius: RadiusTheme = res.currentRadius ?? DEFAULT_WORKSPACE_THEME.radius
      const currentAgent: AgentTheme = res.currentAgent ?? DEFAULT_WORKSPACE_THEME.agent
      console.log('\n' + pc.bold('moi theme') + ' — workspace appearance')
      console.log(
        pc.dim('  Usage: moi theme --font=<key> --color=<key> --radius=<key> --agent=<key>') + '\n'
      )

      const fontRows = (Object.keys(FONT_THEMES) as FontTheme[]).map(key => {
        const f = FONT_THEMES[key]
        const selected = key === currentFont
        return [
          selected ? pc.green('→') : ' ',
          selected ? pc.bold(key) : key,
          f.label,
          pc.dim(f.sans),
          pc.dim(f.mono)
        ]
      })
      console.log(pc.dim('  Fonts'))
      console.log(
        columns(
          ['', 'key', 'label', 'sans', 'mono'].map(h => pc.dim(h)),
          fontRows
        ) + '\n'
      )

      const colorRows = (Object.keys(COLOR_THEMES) as ColorTheme[]).map(key => {
        const c = COLOR_THEMES[key]
        const selected = key === currentColor
        return [
          selected ? pc.green('→') : ' ',
          selected ? pc.bold(key) : key,
          c.label,
          themeSwatch(c.primary)
        ]
      })
      console.log(pc.dim('  Colors'))
      console.log(
        columns(
          ['', 'key', 'label', 'swatch'].map(h => pc.dim(h)),
          colorRows
        ) + '\n'
      )

      const radiusRows = (Object.keys(RADIUS_THEMES) as RadiusTheme[]).map(key => {
        const radius = RADIUS_THEMES[key]
        const selected = key === currentRadius
        return [
          selected ? pc.green('→') : ' ',
          selected ? pc.bold(key) : key,
          radius.label,
          pc.dim(radius.radius)
        ]
      })
      console.log(pc.dim('  Radius'))
      console.log(
        columns(
          ['', 'key', 'label', 'value'].map(h => pc.dim(h)),
          radiusRows
        ) + '\n'
      )

      const agentRows = (Object.keys(AGENT_THEMES) as AgentTheme[]).map(key => {
        const agent = AGENT_THEMES[key]
        const selected = key === currentAgent
        return [selected ? pc.green('→') : ' ', selected ? pc.bold(key) : key, agent.label]
      })
      console.log(pc.dim('  Agent'))
      console.log(
        columns(
          ['', 'key', 'label'].map(h => pc.dim(h)),
          agentRows
        ) + '\n'
      )

      if (notice) console.log(pc.yellow(notice) + '\n')
      ws.close()
      process.exit(0)
    }

    ws.onerror = () => void exitControlUnreachable()
  }
})
