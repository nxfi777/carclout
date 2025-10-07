import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  GetObjectCommand,
  _Object as S3Object,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID || "";
const bucket = process.env.R2_BUCKET || "carclout";
const endpointFromForge = process.env.R2_ENDPOINT || ""; // distrib-forge style
const endpoint = endpointFromForge || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS || "";

export const r2 = new S3Client({
  region: "auto",
  endpoint: endpoint || undefined,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export async function createUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const url = await getSignedUrl(r2, command, { expiresIn: 60 * 5 });
  return { url, key };
}

export async function createGetUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = await getSignedUrl(r2, command, { expiresIn: 60 * 10 });
  return { url, key };
}

export async function createViewUrl(key: string, expiresIn: number = 60 * 60 * 24) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = await getSignedUrl(r2, command, { expiresIn });
  return { url, key };
}

// Shallow listing (one level) using Delimiter, returning direct files and folder names
export async function listObjectsShallow(
  prefix: string,
  maxKeys: number = 1000,
  continuationToken?: string
): Promise<{ files: S3Object[]; folders: string[]; nextToken?: string }> {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const res: ListObjectsV2CommandOutput = await r2.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalized,
      Delimiter: "/",
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    })
  );
  const files: S3Object[] = (res.Contents || []).filter((o: S3Object) => {
    const key = String(o.Key || "");
    const rest = key.slice(normalized.length);
    return rest !== "" && !rest.includes("/");
  });
  const folders: string[] = (res.CommonPrefixes || [])
    .map((cp) => String((cp as { Prefix?: string }).Prefix || ""))
    .filter((p: string) => p.startsWith(normalized))
    .map((p: string) => p.slice(normalized.length).replace(/\/$/, ""))
    .filter((n: string) => !!n);
  const nextToken = res.IsTruncated ? res.NextContinuationToken || undefined : undefined;
  return { files, folders, nextToken };
}

export async function listAllObjects(prefix: string): Promise<S3Object[]> {
  const results: S3Object[] = [];
  let ContinuationToken: string | undefined = undefined;
  do {
    const res: ListObjectsV2CommandOutput = await r2.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken })
    );
    (res.Contents || []).forEach((o: S3Object) => results.push(o));
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken || undefined : undefined;
  } while (ContinuationToken);
  return results;
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deletePrefix(prefix: string) {
  // Batch delete up to 1000 keys per request
  let ContinuationToken: string | undefined = undefined;
  do {
    const res: ListObjectsV2CommandOutput = await r2.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken })
    );
    const keys = (res.Contents || []).map((o: S3Object) => ({ Key: o.Key! }));
    if (keys.length > 0) {
      await r2.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } })
      );
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken || undefined : undefined;
  } while (ContinuationToken);
}

export async function copyObject(sourceKey: string, targetKey: string) {
  // R2 expects CopySource as bucket/key
  await r2.send(
    new CopyObjectCommand({ Bucket: bucket, Key: targetKey, CopySource: `${bucket}/${encodeURI(sourceKey)}` })
  );
}

export async function moveObject(sourceKey: string, targetKey: string) {
  if (sourceKey === targetKey) return;
  await copyObject(sourceKey, targetKey);
  await deleteObject(sourceKey);
}

export async function ensureFolder(prefix: string) {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  await r2.send(
    new PutObjectCommand({ Bucket: bucket, Key: normalized, Body: new Uint8Array(), ContentType: "application/x-directory" })
  );
}

// Export getSignedUrl from AWS SDK for direct use
export { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Helper function to upload buffer to R2
export async function uploadToR2(key: string, buffer: Buffer, contentType: string) {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

export { bucket };

