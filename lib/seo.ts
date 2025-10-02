import type { Metadata } from "next";
import { getEnvBaseUrl } from "@/lib/base-url";

const SITE_NAME = "CarClout";
const DEFAULT_DESCRIPTION = "The content engine built for car creators.";
const DEFAULT_IMAGE = "/nytforge.png";

export const DEFAULT_KEYWORDS = [
  "CarClout",
  "Nytforge",
  "car content",
  "automotive",
  "social media",
  "AI tools",
  "car marketing",
  "creator studio",
  "automotive photography",
  "content planning",
];

const baseUrl = getEnvBaseUrl();

type MetadataImageInput =
  | string
  | {
      src: string;
      alt?: string;
      width?: number;
      height?: number;
    };

type CreateMetadataOptions = {
  title: string;
  description?: string;
  path?: string;
  keywords?: string[];
  image?: MetadataImageInput;
  robots?: Metadata["robots"];
  alternates?: Metadata["alternates"];
  openGraph?: Metadata["openGraph"];
  twitter?: Metadata["twitter"];
  category?: string;
};

type NormalizedImage = {
  url: string;
  alt: string;
  width: number;
  height: number;
};

function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function normalizePath(path?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith("/") ? path : `/${path}`;
}

function resolveKeywords(extra?: string[]): string[] {
  const keywords = [...DEFAULT_KEYWORDS];
  if (extra?.length) keywords.push(...extra);
  const unique = Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)));
  return unique;
}

function resolveImage(image?: MetadataImageInput): NormalizedImage {
  if (typeof image === "string") {
    return {
      url: toAbsoluteUrl(image),
      alt: `${SITE_NAME} preview image`,
      width: 1200,
      height: 630,
    };
  }

  if (image && typeof image === "object") {
    return {
      url: toAbsoluteUrl(image.src),
      alt: image.alt?.trim() || `${SITE_NAME} preview image`,
      width: image.width ?? 1200,
      height: image.height ?? 630,
    };
  }

  return {
    url: toAbsoluteUrl(DEFAULT_IMAGE),
    alt: `${SITE_NAME} preview image`,
    width: 1200,
    height: 630,
  };
}

export function createMetadata(options: CreateMetadataOptions): Metadata {
  const description = options.description?.trim() || DEFAULT_DESCRIPTION;
  const canonicalPath = normalizePath(options.path);
  const absoluteUrl = canonicalPath ? toAbsoluteUrl(canonicalPath) : baseUrl;
  const image = resolveImage(options.image);

  const metadata: Metadata = {
    title: options.title,
    description,
    keywords: resolveKeywords(options.keywords),
    alternates: canonicalPath ? { canonical: canonicalPath } : undefined,
    category: options.category,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: absoluteUrl,
      title: options.title,
      description,
      images: [image],
      ...options.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      title: options.title,
      description,
      images: [image.url],
      ...options.twitter,
    },
  };

  if (metadata.openGraph && !options.openGraph?.images) {
    metadata.openGraph.images = [image];
  }

  if (metadata.twitter && !options.twitter?.images) {
    metadata.twitter.images = [image.url];
  }

  if (options.alternates) {
    metadata.alternates = {
      ...(metadata.alternates ?? {}),
      ...options.alternates,
    };
  }

  if (options.robots) {
    metadata.robots = options.robots;
  }

  return metadata;
}

export const NO_INDEX_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
};


