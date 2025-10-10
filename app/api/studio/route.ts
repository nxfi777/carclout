/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";

fal.config({ credentials: process.env.FAL_KEY || "" });

const STUDIO_CREDITS_PER_GENERATION = 20; // Default credit cost for studio generation

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { prompt, image_urls } = await req.json();
  
  if (!prompt || !image_urls || !Array.isArray(image_urls)) {
    return NextResponse.json({ error: "Missing prompt or image_urls" }, { status: 400 });
  }

  // Submit to async queue
  let queueResult: any;
  try {
    queueResult = await fal.queue.submit("fal-ai/gemini-25-flash-image/edit", {
      input: { prompt, image_urls },
    });
  } catch (err) {
    console.error("Studio queue error:", err);
    return NextResponse.json({ error: "Studio generation failed to start" }, { status: 502 });
  }

  const requestId = queueResult?.requestId || queueResult?.request_id;
  if (!requestId) {
    return NextResponse.json({ error: 'Failed to queue studio generation' }, { status: 502 });
  }

  console.log(`[STUDIO JOB] Queued job ${requestId} for user ${user.email}`);

  // Store job metadata in database
  const db = await getSurreal();
  try {
    await db.query(`
      CREATE tool_job CONTENT {
        email: $email,
        fal_request_id: $fal_request_id,
        fal_model: $fal_model,
        tool_type: $tool_type,
        status: $status,
        credits: $credits,
        params: $params,
        created_at: time::now(),
        updated_at: time::now()
      };
    `, {
      email: user.email,
      fal_request_id: requestId,
      fal_model: 'fal-ai/gemini-25-flash-image/edit',
      tool_type: 'studio',
      status: 'pending',
      credits: STUDIO_CREDITS_PER_GENERATION,
      params: {
        prompt,
        image_urls,
      }
    });
  } catch (dbErr) {
    console.error('Failed to store studio job in database:', dbErr);
    // Job is queued on fal.ai, so we continue despite DB error
  }

  // Return job ID immediately - client will poll for status
  return NextResponse.json({ 
    jobId: requestId,
    status: 'pending',
    credits: STUDIO_CREDITS_PER_GENERATION,
    message: 'Studio generation started. Check status at /api/tools/status'
  });
}


