"use client";

import { useEffect } from "react";
import Script from "next/script";
import {
  UMAMI_CONFIG,
  getUmamiDomains,
  trackEvent,
  identifyFromSession,
  waitForUmami,
  setUmamiValue,
  type IdentifyPayload,
} from "@/lib/umami";
import type { Session } from "next-auth";

interface UmamiTrackerProps {
  session: Session | null;
  pageTag?: string;
  tags?: string[];
}

const outboundAttributeName = "data-umami-event";

function addOutboundLinkTracking() {
  if (typeof document === "undefined") return;
  const name = "outbound-link-click";
  document.querySelectorAll<HTMLAnchorElement>("a").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const url = (() => {
      try {
        return href ? new URL(href, window.location.href) : null;
      } catch {
        return null;
      }
    })();
    if (!url) return;
    if (url.host === window.location.host) return;
    if (anchor.hasAttribute(outboundAttributeName)) return;
    anchor.setAttribute("data-umami-event", name);
    anchor.setAttribute("data-umami-event-url", url.href);
  });
}

function useOutboundLinkInstrument() {
  useEffect(() => {
    addOutboundLinkTracking();
    const observer = new MutationObserver(() => addOutboundLinkTracking());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}

function useSessionIdentify(session: Session | null) {
  useEffect(() => {
    if (!session?.user) return;
    const payload: IdentifyPayload = {
      id: session.user.id,
      email: session.user.email,
      plan: (session.user as Record<string, unknown>).plan as string | null | undefined,
      role: (session.user as Record<string, unknown>).role as string | null | undefined,
    };
    identifyFromSession(payload);
  }, [session?.user]);
}

function usePageTags(tags: string[] | undefined) {
  useEffect(() => {
    if (!Array.isArray(tags) || tags.length === 0) return;
    const tagList = [...tags];
    let cancelled = false;
    waitForUmami().then((client) => {
      if (cancelled || !client?.set) return;
      tagList.forEach((tag, index) => {
        client.set?.(`tag_${index + 1}`, tag);
      });
      client.set?.("tags", tagList);
    });
    return () => {
      cancelled = true;
    };
  }, [tags]);
}

function useGlobalEvents() {
  useEffect(() => {
    const mapping: Record<string, string> = {
      "open-pro-upsell": "upsell:open",
      "streak-refresh": "streak:refresh",
      "xp-refresh": "xp:refresh",
      "profile-updated": "profile:updated",
    };
    const handler = (event: Event) => {
      const type = event.type;
      const mapped = mapping[type];
      if (mapped) trackEvent(mapped);
    };
    Object.keys(mapping).forEach((eventName) => {
      window.addEventListener(eventName, handler);
    });
    return () => {
      Object.keys(mapping).forEach((eventName) => {
        window.removeEventListener(eventName, handler);
      });
    };
  }, []);
}

export default function UmamiTracker({ session, pageTag, tags }: UmamiTrackerProps) {
  useOutboundLinkInstrument();
  useSessionIdentify(session);
  usePageTags(tags);
  useGlobalEvents();

  useEffect(() => {
    if (!pageTag) return;
    waitForUmami().then((client) => {
      client?.track?.("page:tag", { tag: pageTag });
      setUmamiValue("pageTag", pageTag);
    });
  }, [pageTag]);

  const domains = getUmamiDomains();

  return (
    <Script
      id="umami-tracker"
      src={`${UMAMI_CONFIG.hostUrl.replace(/\/$/, "")}${UMAMI_CONFIG.scriptPath}`}
      data-website-id={UMAMI_CONFIG.websiteId}
      data-host-url={UMAMI_CONFIG.hostUrl}
      data-domains={domains}
      data-tag={pageTag || UMAMI_CONFIG.tag}
      data-exclude-search="true"
      data-do-not-track="true"
      data-cache="false"
      strategy="afterInteractive"
    />
  );
}


