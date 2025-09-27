import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminLiveToken } from "@/lib/admin-live-token";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role || "user";
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { token, expiresAt } = createAdminLiveToken(session.user.email);
  return NextResponse.json({ token, expiresAt });
}


