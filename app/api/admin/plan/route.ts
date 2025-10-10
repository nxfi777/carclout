import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import type { UserDoc } from "@/types/db";

export async function POST(req: Request) {
	const session = await auth();
	const email = session?.user?.email || "";
	const role = session?.user?.role || session?.user?.plan || null;
	if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	
	const { targetEmail, plan } = await req.json().catch(()=>({} as Record<string, unknown>));
	
	// Validate plan value (legacy aliases normalize to canonical plan ids)
	const validPlans = ["minimum", null] as const;
	const normalizedPlan = typeof plan === "string" ? plan.trim().toLowerCase() : plan;
	const allowedPlan = normalizedPlan === null || validPlans.includes(normalizedPlan as (typeof validPlans)[number])
		? normalizedPlan
		: normalizedPlan === "basic" || normalizedPlan === "base" ? "minimum"
		: normalizedPlan;
	if (!targetEmail || (allowedPlan !== null && !validPlans.includes(allowedPlan as (typeof validPlans)[number]))) {
		return NextResponse.json({ error: "targetEmail and valid plan required (minimum or null)" }, { status: 400 });
	}
	
	try {
		const db = await getSurreal();
		
		// Check if target user exists and get their role
		const targetUserRes = await db.query<UserDoc[]>(
			`SELECT * FROM user WHERE email = $email LIMIT 1;`,
			{ email: String(targetEmail) }
		);
		const targetUsers: UserDoc[] = Array.isArray(targetUserRes) && Array.isArray(targetUserRes[0]) 
			? (targetUserRes[0] as UserDoc[]) 
			: [];
		
		if (!targetUsers.length) {
			return NextResponse.json({ error: "Target user not found" }, { status: 404 });
		}
		
		const targetUser = targetUsers[0];
		
		// Prevent changing plans of other admins
		if (targetUser.role === "admin") {
			return NextResponse.json({ error: "Cannot change plan for admin users" }, { status: 403 });
		}
		
		// Update the user's plan
		await db.query(
			`UPDATE user SET plan = $plan WHERE email = $email;`,
			{ email: String(targetEmail), plan: allowedPlan === null ? null : String(allowedPlan) }
		);
		
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("Failed to update user plan:", error);
		return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
	}
}
