import { describe, expect, test } from 'bun:test'
import { parseHTML } from 'linkedom'
import { renderToStaticMarkup } from 'react-dom/server'

import { WorkspaceSplitLayout } from './WorkspaceSplitLayout'

function render(open: boolean) {
  const html = renderToStaticMarkup(
    <WorkspaceSplitLayout
      workspace={<div>Workspace content</div>}
      chat={<div id="test-chat">Chat content</div>}
      open={open}
      workspaceMinWidth={640}
      chatMinWidth={320}
      chatMaxWidth={460}
      chatWidth={360}
      onCollapse={() => {}}
      onChatWidthChange={() => {}}
    />
  )
  return parseHTML(`<html><body>${html}</body></html>`).document
}

describe('WorkspaceSplitLayout', () => {
  test('renders workspace and chat with an accessible resize handle', () => {
    const document = render(true)
    const handle = document.querySelector('[role="separator"]')

    expect(document.body.textContent).toContain('Workspace content')
    expect(document.body.textContent).toContain('Chat content')
    expect(handle?.getAttribute('aria-label')).toBe('Resize chat')
    expect(handle?.hasAttribute('hidden')).toBe(false)
    expect(handle?.getAttribute('aria-disabled')).not.toBe('true')
    expect(
      document.getElementById('test-chat')?.closest('[inert], [aria-hidden="true"]')
    ).toBeNull()
  })

  test('makes a closed chat inert and hides its resize handle while retaining its content', () => {
    const document = render(false)
    const handle = document.querySelector('[role="separator"]')
    const chat = document.getElementById('test-chat')

    expect(document.body.textContent).toContain('Workspace content')
    expect(chat?.textContent).toBe('Chat content')
    expect(chat?.closest('[inert]')?.getAttribute('aria-hidden')).toBe('true')
    expect(handle?.hasAttribute('hidden')).toBe(true)
    expect(handle?.getAttribute('aria-disabled')).toBe('true')
  })
})
