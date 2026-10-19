import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import {
  ChatEmptyState,
  WORKSPACE_ANALYSIS_PROMPT
} from '@/client/features/chat/messages/chat-empty-state'
import { renderMoiContext } from '@/lib/moi-context'

function renderExploreWorkspace(disabled = false): string {
  return renderToStaticMarkup(
    createElement(ChatEmptyState, {
      agent: 'boxy',
      kind: 'explore-workspace',
      hasWorkspaceApplets: false,
      disabled,
      onSelectPrompt: () => undefined,
      onNavigate: () => undefined
    })
  )
}

describe('ExploreWorkspaceState', () => {
  test('offers one workspace analysis action', () => {
    const html = renderExploreWorkspace()
    const promptButtons = [...html.matchAll(/<button.*?<\/button>/gs)]

    expect(html).toContain('Explore the workspace')
    expect(promptButtons).toHaveLength(1)
  })

  test('disables the analysis prompt when sending is unavailable', () => {
    const html = renderExploreWorkspace(true)

    expect(html.match(/<button.*?<\/button>/s)?.[0]).toContain('disabled=""')
  })

  test('keeps analysis instructions in hidden message context', () => {
    const html = renderExploreWorkspace()
    expect(html).not.toContain('Wait for me to choose')

    const context = renderMoiContext({
      activeTab: { id: 'overview' },
      directives: [...WORKSPACE_ANALYSIS_PROMPT.context]
    })
    // This instruction protects the review step before an agent changes user files.
    expect(context).toContain('Wait for me to choose before building anything')
  })
})
