import { SidebarLayout } from '@/client/app/shell/sidebar-layout'
import { HomePage } from '@/client/features/home/home-page'

// The `/` route: the app shell wrapping the workspaces view.
export function HomeRoute() {
  return (
    <SidebarLayout showWorkspaces={false}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <HomePage />
      </div>
    </SidebarLayout>
  )
}
