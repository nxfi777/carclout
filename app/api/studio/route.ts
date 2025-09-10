import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getSessionUser } from "@/lib/user";

fal.config({ credentials: process.env.FAL_KEY || "" });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { prompt, image_urls } = await req.json();
  const result = await fal.subscribe("fal-ai/gemini-25-flash-image/edit", {
    input: { prompt, image_urls },
    logs: false,
  });
  return NextResponse.json(result.data);
}


