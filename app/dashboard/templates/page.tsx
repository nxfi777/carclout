"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TemplatesTabContent } from '@/components/ui/tabs-view-fancy';

export default function TemplatesPage() {
  return (
    <main className="p-3 md:p-4">
      <div className="flex items-center justify-end mb-3">
        <Button asChild variant="secondary" size="sm">
          <Link href="/dashboard/workspace?path=library">Recent images</Link>
        </Button>
      </div>
      <TemplatesTabContent />
    </main>
  );
}


