import type { ViewInfo, WidgetInfo } from '@/lib/types'

import { useWorkspaceLayoutCtx } from './workspace-layout-context'
import { WorkspaceContent } from './workspace-content'
import { useWorkspaceSetup } from './setup/workspace-setup'
import { WorkspacePendingScreen } from './workspace-pending-screen'

type WorkspaceScreenProps = {
  contentPending: boolean
  widgets: WidgetInfo[]
  views: ViewInfo[]
}

export function WorkspaceScreen({ contentPending, widgets, views }: WorkspaceScreenProps) {
  const { layout, workspaceId, name, provider } = useWorkspaceLayoutCtx()
  const { content, ready, setupRequired } = useWorkspaceSetup(workspaceId, contentPending, {
    name: name ?? 'Workspace',
    icon: layout.icon,
    workspaceType: provider,
    workspaceTheme: layout.theme
  })

  return ready ? (
    <WorkspaceContent widgets={widgets} views={views} />
  ) : (
    <WorkspacePendingScreen setupRequired={setupRequired}>{content}</WorkspacePendingScreen>
  )
}
