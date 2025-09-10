"use client";
import { DashboardWorkspacePanel } from '@/components/dashboard-workspace-panel';

export default function DashboardWorkspacePage() {
  return (
    <main className="p-3 md:p-4">
      <div className="h-[calc(100dvh-10rem)] min-h-[60vh]">
        <DashboardWorkspacePanel />
      </div>
    </main>
  );
}


