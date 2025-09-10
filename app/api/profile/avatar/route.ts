import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { uploadAvatarToR2 } from "@/lib/r2-avatar";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  const url = await uploadAvatarToR2(file, user.email);
  if (!url) return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  return NextResponse.json({ url });
}


