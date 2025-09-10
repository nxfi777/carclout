"use client";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

type Asset = {
  _id: string;
  title: string;
  description?: string;
  category: "templates" | "hooks" | "ebook" | "videos";
  url?: string;
  fileUrl?: string;
  image?: { asset?: { url: string } };
  access?: "free" | "premium" | "ultra";
};

export function DashboardDownloadsPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/assets", { cache: "no-store" }).then((r) => r.json());
        if (!mounted) return;
        setAssets(res.assets || []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const categories = useMemo<Asset["category"][]>(() => ["templates", "hooks", "ebook", "videos"], []);
  const byCat = useMemo(() => Object.fromEntries(categories.map((c) => [c, assets.filter((a) => a.category === c)])), [assets, categories]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading content…</div>;

  return (
    <div className="grid gap-4">
      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Canva Templates</TabsTrigger>
          <TabsTrigger value="hooks">Hooks</TabsTrigger>
          <TabsTrigger value="ebook">E‑book</TabsTrigger>
          <TabsTrigger value="videos">Video Tutorials</TabsTrigger>
        </TabsList>
        {categories.map((c) => (
          <TabsContent key={c} value={c} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(byCat[c] as Asset[]).map((a) => (
              <Card key={a._id}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{a.title}</span>
                    {a.access && a.access !== "free" ? (
                      <span className="text-xs rounded bg-primary/10 text-primary px-2 py-1 uppercase">{a.access}</span>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">{a.description}</p>
                  {a.fileUrl || a.url ? (
                    <Link className="underline text-sm" href={(a.fileUrl || a.url) as string} target="_blank">Download</Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">Coming soon</span>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}


