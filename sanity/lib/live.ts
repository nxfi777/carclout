// Querying with "sanityFetch" will keep content automatically updated
// Before using it, import and render "<SanityLive />" in your layout, see
// https://github.com/sanity-io/next-sanity#live-content-api for more information.
import { client } from './client';
import type { ReactElement } from 'react';

// Fallback shim: expose a stable sanityFetch and a no-op SanityLive component
export const sanityFetch = client.withConfig({ apiVersion: 'v2023-10-10' }).fetch.bind(client);
export const SanityLive = (): ReactElement | null => null;
