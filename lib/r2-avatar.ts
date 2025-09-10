import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "@/lib/r2";

const bucket = process.env.R2_BUCKET || "ignite";
const publicDomain = (process.env.R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_R2_PUBLIC_BASE || "").replace(/\/$/, "");

export async function uploadAvatarToR2(file: File, email: string): Promise<string | undefined> {
  try {
    const safeEmail = email.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const key = `users/${safeEmail}/avatars/${Date.now()}_${file.name}`;
    const arrayBuffer = await file.arrayBuffer();
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(arrayBuffer),
      ContentType: file.type || "application/octet-stream",
    }));
    return `${publicDomain}/${key}`;
  } catch (e) {
    console.error("uploadAvatarToR2 error", e);
    return undefined;
  }
}


