import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'

import { CHAT_WELCOME_PROMPTS, ChatEmptyState } from './ChatEmptyState'

type EmptyStateProps = ComponentProps<typeof ChatEmptyState>

let document: Document
let root: ReturnType<typeof createRoot>
let descriptors: Map<string, PropertyDescriptor | undefined>
const onSelectPrompt = mock<EmptyStateProps['onSelectPrompt']>(() => {})
const onNavigate = mock<EmptyStateProps['onNavigate']>(() => {})

beforeEach(() => {
  const dom = parseHTML('<html><body><div id="root"></div></body></html>')
  document = dom.document
  const globals = {
    window: dom.window,
    document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true
  }
  descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  root = createRoot(document.getElementById('root')!)
  onSelectPrompt.mockClear()
  onNavigate.mockClear()
})

afterEach(async () => {
  try {
    await act(async () => root.unmount())
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

async function render(overrides: Partial<EmptyStateProps> = {}) {
  await act(async () => {
    root.render(
      <ChatEmptyState
        agent="boxy"
        kind="welcome"
        hasWorkspaceApplets={false}
        onSelectPrompt={onSelectPrompt}
        onNavigate={onNavigate}
        {...overrides}
      />
    )
  })
}

function button(name: string) {
  const element = [...document.querySelectorAll('button')].find(
    candidate => candidate.textContent?.trim() === name
  )
  if (!element) throw new Error(`Button not found: ${name}`)
  return element
}

test('welcome links navigate to their destinations', async () => {
  await render()
  for (const label of ['Overview', 'Views', 'Scratchpad']) {
    await act(async () => button(label).click())
  }
  expect(onNavigate.mock.calls).toEqual([['overview'], ['views'], ['scratchpad']])
  expect(onSelectPrompt).not.toHaveBeenCalled()
})

test('example buttons send their complete request and context while only showing the label', async () => {
  await render()
  for (const prompt of CHAT_WELCOME_PROMPTS) {
    expect(document.body.textContent).not.toContain(prompt.prompt)
    for (const directive of prompt.context)
      expect(document.body.textContent).not.toContain(directive)
    await act(async () => button(prompt.label).click())
  }
  expect(onSelectPrompt.mock.calls).toEqual(CHAT_WELCOME_PROMPTS.map(prompt => [prompt]))
  expect(onNavigate).not.toHaveBeenCalled()
})

test('unavailable sending blocks example clicks while navigation remains usable', async () => {
  await render({ disabled: true })
  for (const prompt of CHAT_WELCOME_PROMPTS) {
    const example = button(prompt.label)
    expect(example.hasAttribute('disabled')).toBe(true)
    await act(async () => example.click())
  }
  expect(onSelectPrompt).not.toHaveBeenCalled()
  await act(async () => button('Overview').click())
  expect(onNavigate).toHaveBeenCalledWith('overview')
})
