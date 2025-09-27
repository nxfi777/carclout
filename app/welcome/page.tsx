"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type MeResponse = { name?: string; email?: string; plan?: string | null } | { error: string };

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomePageInner />
    </Suspense>
  );
}

function WelcomePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [checking, setChecking] = useState(true);
  // Removed bio/photos UI state
  const appliedParamsRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const meRes = await fetch('/api/me', { cache: 'no-store' });
        if (meRes.status === 401) {
          router.replace('/auth/signin');
          return;
        }
        const me: MeResponse = await meRes.json();
        const plan = ("plan" in (me as Record<string, unknown>) ? (me as Record<string, unknown>).plan : null) as string | null | undefined;
        const email = ("email" in (me as Record<string, unknown>) && typeof (me as Record<string, unknown>).email === 'string')
          ? String((me as Record<string, string>).email)
          : null;
        // Compute and optionally use displayName if needed in future
        const _displayName = ("name" in (me as Record<string, unknown>) && typeof (me as Record<string, unknown>).name === 'string')
          ? String((me as Record<string, unknown>).name)
          : ("email" in (me as Record<string, unknown>) ? String((me as Record<string, unknown>).email) : "");
        const isSubscribed = plan === 'minimum' || plan === 'basic' || plan === 'pro';
        if (isSubscribed) {
          router.replace('/dashboard/home');
          return;
        }
        // Apply any onboarding params after login (once)
        if (!appliedParamsRef.current) {
          appliedParamsRef.current = true;
          const handle = params.get('name') || '';
          const emailFallback = email ? sanitizeInstagramHandle((email.split('@')[0] || '')) : '';
          const chosenPlan = params.get('plan') || '';
          try {
            if (handle) {
              const sanitizedHandle = sanitizeInstagramHandle(handle);
              if (sanitizedHandle && (!emailFallback || sanitizedHandle !== emailFallback)) {
                await fetch('/api/profile', { method: 'POST', body: JSON.stringify({ name: sanitizedHandle }) });
              }
            }
          } catch {}
          // If a plan was preselected before signup, redirect to new plan page instead
          if (chosenPlan === 'minimum' || chosenPlan === 'pro') {
            router.replace(`/plan?plan=${encodeURIComponent(chosenPlan)}`);
            return;
          }
        }
        // Profile prefill removed: bio/photos not shown on welcome page
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [router, params]);

  function sanitizeInstagramHandle(input: string): string {
    const withoutAt = input.toLowerCase().replace(/^@+/, "");
    const filtered = withoutAt.replace(/[^a-z0-9._]/g, "");
    return filtered.slice(0, 30);
  }

  // Legacy route: forward to new plan page (run once)
  useEffect(() => {
    const chosen = params.get('plan');
    const qp = new URLSearchParams();
    if (chosen) qp.set('plan', chosen);
    router.replace(`/plan${qp.toString() ? `?${qp.toString()}` : ''}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) return null;
  return null;
}

// Removed WelcomeChatPhotoPicker and related UI


