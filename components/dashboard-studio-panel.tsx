"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function DashboardStudioPanel() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [scene, setScene] = useState("snowy mountain pass, 50mm lens, f/2.8, rule of thirds, cinematic lighting, crisp atmosphere, high dynamic range");
  const [output, setOutput] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!files || files.length === 0) return;
    setSubmitting(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const presign: { url: string; key: string } = await fetch("/api/storage/presign", {
          method: "POST",
          body: JSON.stringify({ filename: f.name, contentType: f.type }),
        }).then((r) => r.json());
        await fetch(presign.url, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
        const pub = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE || "";
        urls.push(`${pub}/${presign.key}`);
      }

      const res = await fetch("/api/studio", {
        method: "POST",
        body: JSON.stringify({ prompt: scene, image_urls: urls }),
      });
      const data: { images?: { url?: string }[] } = await res.json();
      setOutput(data?.images?.[0]?.url || null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <Input type="file" multiple accept="image/*" onChange={(e) => setFiles(e.target.files)} />
        <Input value={scene} onChange={(e) => setScene(e.target.value)} />
        <Button onClick={submit} disabled={submitting}>{submitting ? "Generating..." : "Generate"}</Button>
      </div>
      {output ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={output} alt="result" className="max-w-full rounded" />
      ) : (
        <p className="text-sm text-muted-foreground">Upload source images and generate a scene.</p>
      )}
    </div>
  );
}


