import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import {
  ChatEmptyState,
  type ChatEmptyStateKind,
  resolveChatEmptyState
} from '@/client/features/chat/messages/chat-empty-state'

function renderState(kind: ChatEmptyStateKind, hasWorkspaceApplets = false): string {
  return renderToStaticMarkup(
    createElement(ChatEmptyState, {
      agent: 'boxy',
      kind,
      hasWorkspaceApplets,
      onSelectPrompt: () => undefined,
      onNavigate: () => undefined
    })
  )
}

describe('resolveChatEmptyState', () => {
  test('gives the welcome state first priority', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'overview',
        isViewDraft: false,
        hasSentMessageFromMoi: false,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('welcome')
  })

  test('shows the workspace exploration state for a pending imported workspace', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'overview',
        isViewDraft: false,
        hasSentMessageFromMoi: true,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('explore-workspace')
  })

  test('uses the overview empty state without pending analysis', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'overview',
        isViewDraft: false,
        hasSentMessageFromMoi: true,
        isWorkspacePendingAnalysis: false
      })
    ).toBe('overview-empty')
  })

  test('uses a separate empty state on other tabs', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'scratchpad',
        isViewDraft: false,
        hasSentMessageFromMoi: true,
        isWorkspacePendingAnalysis: false
      })
    ).toBe('tab-empty')
  })

  test('gives the pending view priority', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'views/example',
        isViewDraft: true,
        hasSentMessageFromMoi: false,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('view-draft')
  })
})

describe('ChatEmptyState', () => {
  test('renders the selected empty state', () => {
    expect(renderState('welcome')).toContain('Moi is the personal workspace')
    expect(renderState('welcome')).toContain('Try an example:')
    expect(renderState('explore-workspace')).toContain(
      'Your agent can explore this workspace and suggest useful widgets and views based on'
    )
    expect(renderState('explore-workspace')).toContain('Explore the workspace')
    expect(renderState('overview-empty')).toContain('create widgets and views')
    expect(renderState('tab-empty')).toContain('manage the view from here')
  })

  test('renders the focused new-view prompt', () => {
    const html = renderState('view-draft')

    expect(html).toContain('Describe the content, data, and key actions you need in the view')
  })

  test('hides examples when the workspace already has applets', () => {
    const html = renderState('welcome', true)

    expect(html).toContain('Moi is the personal workspace')
    expect(html).not.toContain('Try an example:')
    expect(html).not.toContain('Check the weather')
    expect(html).not.toContain('Track my finances')
    expect(html).not.toContain('Build a playful synthesizer')
  })
})
