"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SchedulerPageClient() {
  const [when, setWhen] = useState("");
  const [platforms, setPlatforms] = useState("youtube, tiktok, instagram");

  return (
    <div className="container mx-auto py-[2rem] grid gap-4">
      <h1 className="text-2xl font-semibold">Schedule Posts</h1>
      <Input placeholder="When (ISO or natural language)" value={when} onChange={(event) => setWhen(event.target.value)} />
      <Input placeholder="Platforms" value={platforms} onChange={(event) => setPlatforms(event.target.value)} />
      <Button onClick={() => toast.success("Scheduling placeholder saved")}>Schedule</Button>
      <p className="text-muted-foreground text-sm">Posting will use n8n integration later. Best time helper coming soon.</p>
    </div>
  );
}
