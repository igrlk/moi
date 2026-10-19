import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { wcagContrast } from 'culori'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  COLOR_THEMES,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_WORKSPACE_THEME,
  deriveThemeColors,
  resolveWorkspaceTheme
} from '@/lib/themes'
import type { WorkspaceLayout, WorkspaceTheme } from '@/lib/types'

import { loadLayout, saveLayout } from '../workspaces/layout'
import { applyThemeUpdate } from '../workspaces/theme'

describe('color themes', () => {
  test('keeps the default primary source aligned with the root theme', async () => {
    const css = await Bun.file(join(import.meta.dir, '../../client/index.css')).text()

    expect(css).toContain(`--primary: ${DEFAULT_PRIMARY_COLOR};`)
  })

  // index.html carries a hardcoded first-paint background, because the
  // stylesheet that defines `--muted` is render-blocking and the browser would
  // otherwise paint its white canvas first. A literal cannot follow the token,
  // so pin them together here — drift shows up as a white flash on cold loads,
  // which nothing else would catch.
  test('keeps the shell first-paint background aligned with --muted', async () => {
    const html = await Bun.file(join(import.meta.dir, '../../client/index.html')).text()
    const indexCss = await Bun.file(join(import.meta.dir, '../../client/index.css')).text()

    const shellBackground = html.match(/html \{\s*background:\s*([^;]+);/)?.[1]?.trim()
    const root = indexCss.match(/:root \{([\s\S]*?)\n\}/)?.[1]
    const muted = root?.match(/--muted:\s*([^;]+);/)?.[1]?.trim()

    expect(shellBackground).toBeDefined()
    expect(muted).toBeDefined()
    expect(shellBackground).toBe(muted)
    expect(html).toContain('<meta name="color-scheme" content="light" />')
  })

  test('keeps the selected primary and chooses readable text for light and dark inputs', () => {
    expect(deriveThemeColors('oklch(1 0 0)')).toMatchObject({
      primary: 'oklch(1 0 0)',
      primaryForeground: 'oklch(0 0 0)'
    })
    expect(deriveThemeColors('oklch(0 0 0)')).toMatchObject({
      primary: 'oklch(0 0 0)',
      primaryForeground: 'oklch(1 0 0)'
    })
  })

  test('uses the selected color as the widget surface without a circular primary reference', () => {
    const primary = 'oklch(0.7426 0.1817 56.01)'
    const colors = deriveThemeColors(primary, 'widget')

    expect(colors.background).toBe(primary)
    expect(wcagContrast(primary, colors.foreground)).toBeGreaterThanOrEqual(3)
    expect(colors.primary).toContain('var(--background)')
    expect(colors.primary).not.toContain('var(--primary)')
  })

  test('preset text meets the existing contrast floor on workspace and widget surfaces', () => {
    for (const preset of Object.values(COLOR_THEMES)) {
      const primary = preset.primary ?? DEFAULT_PRIMARY_COLOR
      const normal = deriveThemeColors(primary)
      const widget = deriveThemeColors(primary, 'widget')
      expect(wcagContrast(primary, normal.primaryForeground)).toBeGreaterThanOrEqual(3)
      expect(wcagContrast(primary, widget.foreground)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('applyThemeUpdate', () => {
  test('setting one option preserves the others', () => {
    const current = {
      font: 'sans' as const,
      color: 'paper' as const,
      radius: 'squishy' as const,
      agent: 'dorito' as const
    }
    const result = applyThemeUpdate(current, { font: 'serif' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'serif',
      color: 'paper',
      radius: 'squishy',
      agent: 'dorito'
    })
    expect(result.applied).toEqual({ font: 'serif' })
  })

  test('setting color uses its preset key', () => {
    const current = {
      font: 'mono' as const,
      color: 'default' as const,
      radius: 'subtle' as const,
      agent: 'blob' as const
    }
    const result = applyThemeUpdate(current, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'mono',
      color: 'paper',
      radius: 'subtle',
      agent: 'blob'
    })
    expect(result.applied).toEqual({ color: 'paper' })
  })

  test("'sans' remains an explicit font preset", () => {
    const current = {
      font: 'serif' as const,
      color: 'paper' as const,
      radius: 'soft' as const,
      agent: 'boxy' as const
    }
    const result = applyThemeUpdate(current, { font: 'sans' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'sans',
      color: 'paper',
      radius: 'soft',
      agent: 'boxy'
    })
  })

  test('combined font + color updates apply both', () => {
    const result = applyThemeUpdate(undefined, {
      font: 'serif',
      color: 'mint',
      radius: 'square',
      agent: 'pill'
    })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'serif',
      color: 'mint',
      radius: 'square',
      agent: 'pill'
    })
    expect(result.applied).toEqual({
      font: 'serif',
      color: 'mint',
      radius: 'square',
      agent: 'pill'
    })
  })

  test('fills missing options with the workspace defaults', () => {
    const result = applyThemeUpdate(undefined, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ ...DEFAULT_WORKSPACE_THEME, color: 'paper' })
  })

  test('rejects unknown font key', () => {
    const result = applyThemeUpdate(undefined, { font: 'comic-sans' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('comic-sans')
  })

  test('rejects unknown color key', () => {
    const result = applyThemeUpdate(undefined, { color: 'neon' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('neon')
  })

  test("'soft' remains an explicit preset", () => {
    const current = {
      font: 'serif' as const,
      color: 'rose' as const,
      radius: 'squishy' as const,
      agent: 'dorito' as const
    }
    const result = applyThemeUpdate(current, { radius: 'soft' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      font: 'serif',
      color: 'rose',
      radius: 'soft',
      agent: 'dorito'
    })
    expect(result.applied).toEqual({ radius: 'soft' })
  })

  test('rejects unknown radius key', () => {
    const result = applyThemeUpdate(undefined, { radius: 'pillowy' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('pillowy')
  })

  test('setting agent uses its preset key', () => {
    const result = applyThemeUpdate(undefined, { agent: 'dorito' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ ...DEFAULT_WORKSPACE_THEME, agent: 'dorito' })
    expect(result.applied).toEqual({ agent: 'dorito' })
  })

  test('rejects unknown agent key', () => {
    const result = applyThemeUpdate(undefined, { agent: 'cloud' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('cloud')
  })
})

describe('resolveWorkspaceTheme', () => {
  test('returns one complete default theme', () => {
    expect(resolveWorkspaceTheme()).toEqual(DEFAULT_WORKSPACE_THEME)
  })

  test('fills missing preset keys', () => {
    expect(resolveWorkspaceTheme({ font: 'serif' })).toEqual({
      font: 'serif',
      color: 'default',
      radius: 'soft',
      agent: 'boxy'
    })
  })

  test('falls back from unknown saved preset keys', () => {
    const unknownTheme = {
      font: 'legacy',
      color: 'legacy',
      radius: 'legacy',
      agent: 'legacy'
    } as unknown as WorkspaceTheme

    expect(resolveWorkspaceTheme(unknownTheme)).toEqual(DEFAULT_WORKSPACE_THEME)
  })
})

describe('loadLayout/saveLayout round-trip with theme', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'moi-theme-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('persists the selected preset keys', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      layoutMode: 'fullscreen',
      tabs: { open: ['scratchpad'], active: 'scratchpad' },
      theme: {
        font: 'serif',
        color: 'paper',
        radius: 'subtle',
        agent: 'dorito'
      }
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual(layout.theme)
  })

  test('persists the complete default theme', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      layoutMode: 'fullscreen',
      tabs: { open: ['scratchpad'], active: 'scratchpad' },
      theme: DEFAULT_WORKSPACE_THEME
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual(DEFAULT_WORKSPACE_THEME)
  })
})
