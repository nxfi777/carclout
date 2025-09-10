import { NextResponse } from "next/server";
import axios from "axios";
import { createChatCompletion } from "../../../../soranyt/lib/openrouter";

export async function POST(req: Request) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  const html = await axios.get(url).then((r) => r.data as string);
  const prompt = `Summarize this automotive news into a short post with key specs and a punchy hook. Keep to 80-120 words.\n\n${html.slice(0, 5000)}`;
  const out = await createChatCompletion({
    model: "openrouter/auto",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });
  const text = out?.choices?.[0]?.message?.content || "";
  return NextResponse.json({ text });
}


