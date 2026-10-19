import type {
  ScratchArrowEnd,
  ScratchColor,
  ScratchFill,
  ScratchImageQuality,
  ScratchOp,
  ScratchSize,
  ScratchStyle
} from '@/lib/types'
import { defineCommand } from 'citty'
import { tmpdir } from 'node:os'
import { join, resolve } from 'path'
import { dirArg } from '../args'
import { sendControl } from '../control'
import pc from '../pc'

// Parse a "x,y" coordinate pair (tldraw canvas space, y down).
function parseXY(s: string): { x: number; y: number } {
  const parts = s.split(',').map(p => Number(p.trim()))
  if (parts.length !== 2 || !parts.every(n => Number.isFinite(n))) {
    throw new Error(`Expected "x,y", got "${s}"`)
  }
  return { x: parts[0], y: parts[1] }
}

// An arrow endpoint: a bare "x,y" is a free point; anything else is a shape name
// to bind to (so the arrow follows that shape).
function parseEnd(s: string): ScratchArrowEnd {
  if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(s)) return parseXY(s)
  return { name: s }
}

// The Scratchpad palette (matches the UI toolbar's six swatches) and each color's
// light-theme solid hex — used to snap an arbitrary `--color #rrggbb` to the nearest
// palette entry (tldraw shapes can't hold free hex). Keep in sync with the swatches
// in client/features/scratchpad/Scratchpad.tsx.
const COLOR_HEX: Record<ScratchColor, string> = {
  black: '#1d1d1d',
  red: '#e03131',
  yellow: '#f1ac4b',
  green: '#099268',
  blue: '#4465e9',
  grey: '#9fa8b2'
}

const COLOR_NAMES = Object.keys(COLOR_HEX) as ScratchColor[]

// Arrows expose tldraw's size as a line weight; the CLI mirrors the UI's two sizes.
const STROKE_SIZES: Record<string, ScratchSize> = { small: 'm', large: 'xl' }

const STROKE_NAMES = Object.keys(STROKE_SIZES)

// Text & notes expose the same size style as a label font size, under friendlier names.
const FONT_SIZES: Record<string, ScratchSize> = { regular: 'm', big: 'xl' }

const FONT_SIZE_NAMES = Object.keys(FONT_SIZES)

// Rectangle fills — the UI toolbar's four options. Each user-facing name maps onto a
// tldraw DefaultFillStyle value (see ScratchFill for tldraw's semi/solid quirk). Keep
// in sync with FILL_OPTIONS in client/features/scratchpad/Scratchpad.tsx.
const FILL_STYLES: Record<string, ScratchFill> = {
  none: 'none',
  semi: 'solid',
  pattern: 'pattern',
  solid: 'fill'
}

const FILL_NAMES = Object.keys(FILL_STYLES)

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Accept a palette name as-is, or snap any hex to the nearest palette color by
// squared RGB distance. Throws on anything else.
function parseColor(s: string): ScratchColor {
  const lower = s.trim().toLowerCase()
  if ((COLOR_NAMES as string[]).includes(lower)) return lower as ScratchColor
  const rgb = hexToRgb(s)
  if (!rgb) {
    throw new Error(
      `Unknown color "${s}". Use a hex like "#4465e9" or one of: ${COLOR_NAMES.join(', ')}.`
    )
  }
  let best: ScratchColor = 'black'
  let bestDist = Infinity
  for (const name of COLOR_NAMES) {
    const [r, g, b] = hexToRgb(COLOR_HEX[name])!
    const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2
    if (d < bestDist) {
      bestDist = d
      best = name
    }
  }
  return best
}

function parseStroke(s: string): ScratchSize {
  const size = STROKE_SIZES[s.trim().toLowerCase()]
  if (!size) throw new Error(`Unknown stroke "${s}". Use one of: ${STROKE_NAMES.join(', ')}.`)
  return size
}

function parseFontSize(s: string): ScratchSize {
  const size = FONT_SIZES[s.trim().toLowerCase()]
  if (!size) throw new Error(`Unknown font size "${s}". Use one of: ${FONT_SIZE_NAMES.join(', ')}.`)
  return size
}

function parseFill(s: string): ScratchFill {
  const fill = FILL_STYLES[s.trim().toLowerCase()]
  if (!fill) throw new Error(`Unknown fill "${s}". Use one of: ${FILL_NAMES.join(', ')}.`)
  return fill
}

// Resize preset for `add image` — defaults to 'lo' (keep the canvas light).
function parseImageQuality(s: string | undefined): ScratchImageQuality {
  if (!s) return 'lo'
  const q = s.trim().toLowerCase()
  if (q === 'lo' || q === 'hi') return q
  throw new Error(`Unknown quality "${s}". Use "lo" or "hi".`)
}

// Optional styling shared across `add` commands — each command wires in only the
// controls its shape exposes (mirroring the UI's per-tool style bar).
const colorArg = {
  type: 'string',
  description: `Color: ${COLOR_NAMES.join(', ')}, or any hex (snapped to nearest)`
} as const

const strokeArg = {
  type: 'string',
  description: `Stroke weight: ${STROKE_NAMES.join(', ')}`
} as const

const fontSizeArg = {
  type: 'string',
  description: `Font size: ${FONT_SIZE_NAMES.join(', ')}`
} as const

const fillArg = {
  type: 'string',
  default: 'semi',
  description: `Fill: ${FILL_NAMES.join(', ')} (default: semi)`
} as const

// Build the optional style props from raw args. `stroke` and `fontSize` are two names
// for the same tldraw size style, so at most one is wired per command.
function styleArgs(args: {
  color?: string
  stroke?: string
  fontSize?: string
  fill?: string
}): ScratchStyle {
  return {
    ...(args.color ? { color: parseColor(args.color) } : {}),
    ...(args.stroke ? { size: parseStroke(args.stroke) } : {}),
    ...(args.fontSize ? { size: parseFontSize(args.fontSize) } : {}),
    ...(args.fill ? { fill: parseFill(args.fill) } : {})
  }
}

type ScratchCliOp = ScratchOp | { kind: 'read' } | { kind: 'read-image'; name: string }

function sendScratch(
  path: string,
  op: ScratchCliOp,
  onResult: (res: Record<string, unknown>) => void | Promise<void>
) {
  sendControl(path, { type: 'scratch', path, op }, onResult)
}

// Print the name a draw op landed on, so the agent can address it later.
function printAdded(res: Record<string, unknown>) {
  const result = res.result as { name?: string } | undefined
  console.log('\n' + pc.green('✓') + ' added ' + pc.bold(result?.name ?? '(shape)') + '\n')
}

const scratchRead = defineCommand({
  meta: { name: 'read', description: 'Print the canvas shapes as JSON (served off disk)' },
  args: { dir: dirArg },
  run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'read' }, res => {
      console.log(JSON.stringify(res.shapes ?? [], null, 2))
    })
  }
})

const scratchView = defineCommand({
  meta: { name: 'view', description: 'Render the canvas to a PNG (needs an open Scratchpad tab)' },
  args: {
    dir: dirArg,
    out: { type: 'string', description: 'Output PNG path (default: a temp file)' }
  },
  async run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'view' }, async res => {
      const result = res.result as { image?: string } | undefined
      if (!result?.image) {
        console.error(pc.red('No image returned'))
        process.exit(1)
      }
      const b64 = result.image.replace(/^data:image\/png;base64,/, '')
      const outPath = args.out ? resolve(args.out) : join(tmpdir(), `moi-scratch-${Date.now()}.png`)
      await Bun.write(outPath, Buffer.from(b64, 'base64'))
      console.log(outPath)
    })
  }
})

// Image/video data URL mime → file extension, for naming the saved file. Kept in
// sync with the server's MIME_EXT (server/scratchpad/assets.ts) so avif/apng/video assets
// round-trip through `read-image` with a real extension instead of `.bin`.
const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/apng': 'apng',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
}

const scratchReadImage = defineCommand({
  meta: {
    name: 'read-image',
    description: 'Save an image shape to a file by id (served off disk)'
  },
  args: {
    id: { type: 'positional', required: true, description: 'Image shape id (from `scratch read`)' },
    out: { type: 'string', description: 'Output file path (default: a temp file)' },
    dir: dirArg
  },
  async run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'read-image', name: args.id }, async res => {
      const src = res.src as string | undefined
      if (!src) {
        console.error(pc.red('No image data'))
        process.exit(1)
      }
      // A remote (http) asset has no local bytes to write — just print the URL.
      if (/^https?:\/\//.test(src)) {
        console.log(src)
        return
      }
      const m = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
      if (!m) {
        console.error(pc.red('Unrecognized image source'))
        process.exit(1)
      }
      const [, mime, base64, data] = m
      const bytes = base64
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data), 'utf8')
      const ext = IMAGE_EXT[mime] ?? 'bin'
      const safeId = args.id.replace(/[^a-zA-Z0-9_-]/g, '_')
      const outPath = args.out
        ? resolve(args.out)
        : join(tmpdir(), `moi-scratch-${safeId}-${Date.now()}.${ext}`)
      await Bun.write(outPath, bytes)
      console.log(outPath)
    })
  }
})

const scratchAddText = defineCommand({
  meta: { name: 'text', description: 'Add a text shape' },
  args: {
    at: { type: 'string', required: true, description: 'Position "x,y"' },
    text: { type: 'string', required: true, description: 'Text content' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    color: colorArg,
    fontSize: fontSizeArg,
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.at)
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-text',
        name: args.id ?? '',
        x,
        y,
        text: args.text,
        ...styleArgs({ color: args.color, fontSize: args.fontSize })
      },
      printAdded
    )
  }
})

const scratchAddRect = defineCommand({
  meta: { name: 'rect', description: 'Add a rectangle' },
  args: {
    at: { type: 'string', required: true, description: 'Top-left position "x,y"' },
    size: { type: 'string', required: true, description: 'Size "w,h"' },
    text: { type: 'string', description: 'Optional label' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    color: colorArg,
    fill: fillArg,
    fontSize: fontSizeArg,
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.at)
    const { x: w, y: h } = parseXY(args.size)
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-rect',
        name: args.id ?? '',
        x,
        y,
        w,
        h,
        ...(args.text ? { text: args.text } : {}),
        ...styleArgs({ color: args.color, fill: args.fill, fontSize: args.fontSize })
      },
      printAdded
    )
  }
})

const scratchAddNote = defineCommand({
  meta: { name: 'note', description: 'Add a sticky note' },
  args: {
    at: { type: 'string', required: true, description: 'Position "x,y"' },
    text: { type: 'string', required: true, description: 'Note content' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    color: colorArg,
    fontSize: fontSizeArg,
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.at)
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-note',
        name: args.id ?? '',
        x,
        y,
        text: args.text,
        ...styleArgs({ color: args.color, fontSize: args.fontSize })
      },
      printAdded
    )
  }
})

const scratchAddArrow = defineCommand({
  meta: { name: 'arrow', description: 'Add an arrow connecting shapes or points' },
  args: {
    from: { type: 'string', required: true, description: 'Start: a shape name or "x,y"' },
    to: { type: 'string', required: true, description: 'End: a shape name or "x,y"' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    elbow: {
      type: 'boolean',
      description: 'Right-angle (squared) routing for diagrams; default is a curved arc'
    },
    color: colorArg,
    stroke: strokeArg,
    dir: dirArg
  },
  run({ args }) {
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-arrow',
        name: args.id ?? '',
        from: parseEnd(args.from),
        to: parseEnd(args.to),
        ...(args.elbow ? { elbow: true } : {}),
        ...styleArgs({ color: args.color, stroke: args.stroke })
      },
      printAdded
    )
  }
})

const scratchAddImage = defineCommand({
  meta: { name: 'image', description: 'Add an image from a file (resized to fit the canvas)' },
  args: {
    path: {
      type: 'positional',
      required: true,
      description: 'Path to an image file (png/jpg/webp/gif)'
    },
    at: { type: 'string', description: 'Top-left position "x,y" (default: 0,0)' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    quality: { type: 'string', description: 'Resize: lo (default, smaller) or hi (sharper)' },
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = args.at ? parseXY(args.at) : { x: 0, y: 0 }
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-image',
        name: args.id ?? '',
        x,
        y,
        path: resolve(args.path),
        quality: parseImageQuality(args.quality)
      },
      printAdded
    )
  }
})

const scratchAdd = defineCommand({
  meta: { name: 'add', description: 'Add a shape: text, rect, note, arrow, or image' },
  subCommands: {
    text: scratchAddText,
    rect: scratchAddRect,
    note: scratchAddNote,
    arrow: scratchAddArrow,
    image: scratchAddImage
  }
})

const scratchMove = defineCommand({
  meta: { name: 'move', description: 'Move a shape to a new position' },
  args: {
    id: { type: 'positional', required: true, description: 'Shape name' },
    to: { type: 'string', required: true, description: 'New position "x,y"' },
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.to)
    sendScratch(resolve(args.dir), { kind: 'move', name: args.id, x, y }, () =>
      console.log('\n' + pc.green('✓') + ' moved ' + pc.bold(args.id) + '\n')
    )
  }
})

const scratchSet = defineCommand({
  meta: { name: 'set', description: "Relabel / edit a shape's text" },
  args: {
    id: { type: 'positional', required: true, description: 'Shape name' },
    text: { type: 'string', required: true, description: 'New text' },
    dir: dirArg
  },
  run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'set', name: args.id, text: args.text }, () =>
      console.log('\n' + pc.green('✓') + ' updated ' + pc.bold(args.id) + '\n')
    )
  }
})

const scratchDelete = defineCommand({
  meta: { name: 'delete', description: 'Delete a shape' },
  args: {
    id: { type: 'positional', required: true, description: 'Shape name' },
    dir: dirArg
  },
  run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'delete', name: args.id }, () =>
      console.log('\n' + pc.green('✓') + ' deleted ' + pc.bold(args.id) + '\n')
    )
  }
})

const scratchClear = defineCommand({
  meta: { name: 'clear', description: 'Delete every shape — wipe the whole canvas' },
  args: { dir: dirArg },
  run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'clear' }, () =>
      console.log('\n' + pc.green('✓') + ' cleared the canvas\n')
    )
  }
})

export const scratch = defineCommand({
  meta: {
    name: 'scratch',
    description: 'Read and draw on the workspace Scratchpad canvas'
  },
  subCommands: {
    read: scratchRead,
    'read-image': scratchReadImage,
    view: scratchView,
    add: scratchAdd,
    move: scratchMove,
    set: scratchSet,
    delete: scratchDelete,
    clear: scratchClear
  }
})
