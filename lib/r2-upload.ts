const PUBLIC_DOMAIN = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE || process.env.R2_PUBLIC_DOMAIN || "").replace(/\/$/, "");

function sanitizeSegment(input: string | undefined | null): string | null {
  if (!input) return null;
  const normalized = input.toString().trim().toLowerCase();
  if (!normalized) return null;
  const segment = normalized.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return segment || null;
}

export type UploadFilesToChatOptions = {
  files: File[];
  channel?: string;
  dmEmail?: string | null;
};

export type UploadedChatFile = {
  key: string;
  url?: string;
};

export async function uploadFilesToChat(options: UploadFilesToChatOptions): Promise<UploadedChatFile[]> {
  const { files, channel, dmEmail } = options;
  const list = Array.from(files || []).filter((file): file is File => !!file && file.size >= 0);
  if (!list.length) return [];

  const segments = ["chat-uploads"] as string[];
  const channelSegment = sanitizeSegment(channel || undefined);
  const dmSegment = sanitizeSegment(dmEmail || undefined);
  if (channelSegment) {
    segments.push(`channel-${channelSegment}`);
  } else if (dmSegment) {
    segments.push(`dm-${dmSegment}`);
  }
  const path = segments.join("/");

  const results: UploadedChatFile[] = [];
  for (const file of list) {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("path", path);
    const res = await fetch("/api/storage/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data?.key !== "string") {
      const message = typeof data?.error === "string" ? data.error : "Failed to upload";
      throw new Error(message);
    }
    const key = data.key as string;
    const url = PUBLIC_DOMAIN ? `${PUBLIC_DOMAIN}/${key}` : undefined;
    results.push({ key, url });
  }
  return results;
}
