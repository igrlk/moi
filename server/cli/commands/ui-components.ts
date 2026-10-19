import { defineCommand } from 'citty'

// A static shell over ../ui-components. The meta is inlined here because it
// is all the root help needs; the registry loader stays lazy until used.
export const uiComponents = defineCommand({
  meta: {
    name: 'ui-components',
    description: 'UI components for applets'
  },
  subCommands: () => import('../ui-components').then(m => m.uiComponentsSubCommands),
  async run({ rawArgs }) {
    const { runUiComponentsCatalog } = await import('../ui-components')
    await runUiComponentsCatalog(rawArgs)
  }
})
