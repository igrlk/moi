---
description: TypeScript conventions for component filenames, props, types, and type safety.
globs: '*.ts, *.tsx'
alwaysApply: false
---

- Always define a named `type` for component props above the component. Never use inline object types for props. Name it after the component: `type ChatPanelProps = { ... }`.
- Use kebab-case for all source filenames, including components, hooks, utilities, and tests: `chat-panel.tsx`, `use-chat.ts`, `chat-panel.test.tsx`. Follow the file naming and reference rules in the root `AGENTS.md` when renaming or deleting files. Keep component and props identifiers in PascalCase (`ChatPanel`, `ChatPanelProps`) and hooks/functions in camelCase (`useChat`).
- Never use `any`. Use `unknown` when the type is truly unknown, then narrow it.
- Never cast with `as any`. Prefer proper typing or `as unknown as T` with a comment explaining why.
- Reuse existing types from `lib/types.ts` instead of redefining equivalent shapes.
- Prefer `type` over `interface` for consistency.
- Use `import type` for type-only imports.
- Prefer `undefined` for missing or unset values in internal types, return values, and state. Use `null` only when an external API or an existing public or saved-data contract requires it.
- Do not give `null` and `undefined` different meanings in internal state.
