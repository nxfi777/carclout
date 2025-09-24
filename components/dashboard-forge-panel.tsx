"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardWorkspacePanel } from "@/components/dashboard-workspace-panel";
import ContentTabs from "@/components/ui/content-tabs";
import { Separator } from "@/components/ui/separator";

export function DashboardForgePanel() {
  return (
    <div className="grid gap-3 h-full">
      <Tabs defaultValue="workspace" className="h-full">
        <div className="flex items-center justify-between">
          <TabsList className="bg-transparent p-0 gap-2">
            <TabsTrigger value="workspace" className="px-3 py-1.5 rounded-md border data-[state=active]:bg-white/5">
              Workspace
            </TabsTrigger>
            <TabsTrigger value="content" className="px-3 py-1.5 rounded-md border data-[state=active]:bg-white/5">
              Content
            </TabsTrigger>
          </TabsList>
        </div>

        <Separator className="my-2" />

        <div className="h-full">
          <TabsContent value="workspace" className="h-full">
            <DashboardWorkspacePanel />
          </TabsContent>
          <TabsContent value="content" className="h-full">
            <ContentTabs />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}


