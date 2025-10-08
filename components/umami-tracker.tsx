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
      // Existing events
      "open-pro-upsell": "upsell:open",
      "streak-refresh": "streak:refresh",
      "xp-refresh": "xp:refresh",
      "profile-updated": "profile:updated",
      
      // Activation events (leading indicators of retention)
      "first-template-generated": "activation:first-template",
      "first-vehicle-added": "activation:first-vehicle",
      "first-chat-message": "activation:first-message",
      "first-workspace-upload": "activation:first-upload",
      "first-dm-sent": "activation:first-dm",
      "onboarding-completed": "activation:onboarding-complete",
      "profile-photo-added": "activation:profile-photo",
      "first-vehicle-complete": "activation:vehicle-complete",
      
      // Engagement events
      "template-generated": "engagement:template",
      "message-sent": "engagement:message",
      "dm-sent": "engagement:dm",
      "workspace-upload": "engagement:upload",
      "vehicle-updated": "engagement:vehicle",
      "feature-request-submitted": "engagement:feature-request",
      "daily-bonus-claimed": "engagement:daily-bonus",
      "level-up": "engagement:level-up",
      
      // Community events (retention drivers)
      "first-dm-conversation": "community:first-conversation",
      "dm-reply-received": "community:dm-reply",
      "message-replied-to": "community:message-reply",
      "message-reaction-received": "community:reaction",
      "mention-received": "community:mention",
      "attachment-shared": "community:attachment",
      
      // Monetization events
      "upgrade-initiated": "monetization:upgrade-start",
      "checkout-started": "monetization:checkout-start",
      "checkout-completed": "monetization:checkout-complete",
      "monetization:checkout-complete": "monetization:checkout-complete", // Direct event name
      "checkout-abandoned": "monetization:checkout-abandon",
      "usage-limit-hit": "monetization:limit-hit",
      "pricing-page-viewed": "monetization:pricing-view",
      "billing-portal-opened": "monetization:portal-open",
      "credits-depleted": "monetization:credits-depleted",
      
      // Value realization events
      "first-template-download": "value:first-download",
      "template-download": "value:template-download",
      "vehicle-photos-complete": "value:vehicle-complete",
      "streak-milestone": "value:streak-milestone",
      "template-batch-generated": "value:batch-generation",
      
      // Friction events
      "template-generation-failed": "friction:generation-fail",
      "upload-failed": "friction:upload-fail",
      "checkout-error": "friction:checkout-error",
      "onboarding-skipped": "friction:onboarding-skip",
      "feature-blocked": "friction:feature-blocked",
    };
    
    const handler = (event: Event) => {
      const type = event.type;
      const mapped = mapping[type];
      if (mapped) {
        // Extract event detail data if available
        const detail = (event as CustomEvent).detail;
        trackEvent(mapped, detail);
      }
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
  
  // Track checkout completion with revenue when returning from Stripe
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check if user just returned from successful checkout
    try {
      const checkoutIntent = sessionStorage.getItem('checkoutIntent');
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');
      
      // If we have both checkout intent and Stripe session_id, checkout completed
      if (checkoutIntent && sessionId) {
        const intent = JSON.parse(checkoutIntent);
        
        // Track checkout completion with revenue
        // Revenue amounts based on plan (adjust to match your actual pricing)
        const revenueMap: Record<string, Record<string, number>> = {
          minimum: { monthly: 1, yearly: 12 },
          pro: { monthly: 17, yearly: 156 },
          ultra: { monthly: 39, yearly: 374 }
        };
        
        const revenue = revenueMap[intent.plan]?.[intent.interval] || 0;
        
        // Dispatch event with revenue data
        window.dispatchEvent(new CustomEvent("monetization:checkout-complete", {
          detail: {
            plan: intent.plan,
            interval: intent.interval,
            revenue, // Umami will use this for Revenue reports
            currency: 'usd',
            sessionId
          }
        }));
        
        // Clear the checkout intent so we don't track again
        sessionStorage.removeItem('checkoutIntent');
        
        console.log('[REVENUE] Checkout completed:', { plan: intent.plan, revenue });
      }
    } catch (e) {
      console.error('Failed to track checkout completion:', e);
    }
  }, []);

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


