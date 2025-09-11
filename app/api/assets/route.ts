import { NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";

export const dynamic = "force-dynamic";

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

export async function GET() {
	try {
		const query = `*[_type == "asset" && defined(category)]|order(_createdAt desc){
      _id, title, description, category, url, fileUrl, image, access
    }`;
		const assets = await client.fetch<Asset[]>(query, {}, { cache: "no-store" });
		// Merge Surreal hooks table into hooks category for unified display
		try {
			const { getSurreal } = await import("@/lib/surrealdb");
			const db = await getSurreal();
			const res = await db.query("SELECT title, text FROM hook ORDER BY created_at DESC LIMIT 200;");
			const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<Record<string, unknown>>) : [];
			const hookAssets: Asset[] = rows.map((r, i) => ({
				_id: `hook-${i}-${String((r?.title as string) || "").slice(0,12)}`,
				title: (r?.title as string) || "Hook",
				description: (r?.text as string) || "",
				category: "hooks",
			}));
			const merged = [...(assets || []), ...hookAssets];
			return NextResponse.json({ assets: merged });
		} catch {
			return NextResponse.json({ assets: assets || [] });
		}
	} catch {
		return NextResponse.json({ assets: [], error: "failed" }, { status: 200 });
	}
}


