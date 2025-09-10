"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SchedulerPage() {
  const [when, setWhen] = useState("");
  const [platforms, setPlatforms] = useState("youtube, tiktok, instagram");
  return (
    <div className="container mx-auto py-8 grid gap-4">
      <h1 className="text-2xl font-semibold">Schedule Posts</h1>
      <Input placeholder="When (ISO or natural language)" value={when} onChange={(e) => setWhen(e.target.value)} />
      <Input placeholder="Platforms" value={platforms} onChange={(e) => setPlatforms(e.target.value)} />
      <Button onClick={() => toast.success("Scheduling placeholder saved")}>Schedule</Button>
      <p className="text-muted-foreground text-sm">Posting will use n8n integration later. Best time helper coming soon.</p>
    </div>
  );
}


