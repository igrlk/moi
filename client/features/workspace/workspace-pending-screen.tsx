import type { ReactNode } from 'react'

import { WorkspaceSetupPanel } from './setup/workspace-setup-panel'
import { WorkspaceFrame, WorkspacePane, useWorkspaceFrame } from './workspace-frame'

type WorkspacePendingScreenProps = {
  setupRequired?: boolean
  children: ReactNode
}

export function WorkspacePendingScreen({
  setupRequired = false,
  children
}: WorkspacePendingScreenProps) {
  const frame = useWorkspaceFrame(setupRequired)
  return (
    <WorkspaceFrame
      frame={frame}
      workspace={
        <WorkspacePane mode={frame.mode}>
          {setupRequired ? <WorkspaceSetupPanel>{children}</WorkspaceSetupPanel> : children}
        </WorkspacePane>
      }
    />
  )
}
