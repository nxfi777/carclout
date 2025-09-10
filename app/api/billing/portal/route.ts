import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSessionUser } from "@/lib/user";

export async function POST() {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Try to find Stripe customer by email
  const it = await stripe.customers.search({ query: `email:'${user.email}'` });
  const customer = it.data[0];
  if (!customer) return NextResponse.json({ error: "Customer not found. Complete checkout first." }, { status: 400 });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${baseUrl}/dashboard`,
  });
  return NextResponse.json({ url: session.url });
}


