"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function CarNewsPage() {
  const [url, setUrl] = useState("");
  const [post, setPost] = useState("");

  async function generate() {
    const res = await fetch("/api/car-news", { method: "POST", body: JSON.stringify({ url }) });
    const data = await res.json();
    setPost(data.text || "");
  }

  return (
    <div className="container mx-auto py-8 grid gap-4">
      <h1 className="text-2xl font-semibold">Car News Post</h1>
      <Input placeholder="Paste article URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Button onClick={generate}>Generate Post</Button>
      <textarea className="w-full border rounded p-3 min-h-40" value={post} onChange={(e) => setPost(e.target.value)} />
    </div>
  );
}


