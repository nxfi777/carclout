"use client";

import { useEffect, useRef, useState } from "react";

export default function HeaderCredits() {
  const [credits, setCredits] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let mounted = true;
    function onCreditsRefresh() {
      (async () => {
        try {
          const r = await fetch("/api/credits", { cache: "no-store" }).then((r) => r.json());
          if (!mounted) return;
          const c = typeof r?.credits === "number" ? Number(r.credits) : null;
          if (c != null) setCredits(c);
        } catch {}
      })();
    }
    (async () => {
      try {
        // Prime with current value
        const r = await fetch("/api/credits", { cache: "no-store" }).then((r) => r.json());
        if (!mounted) return;
        const c = typeof r?.credits === "number" ? Number(r.credits) : 0;
        setCredits(Number.isFinite(c) ? c : 0);
      } catch {}
      try {
        const es = new EventSource("/api/credits/live");
        esRef.current = es;
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data || "{}");
            const c = typeof data?.credits === "number" ? Number(data.credits) : null;
            if (c != null && mounted) setCredits(c);
          } catch {}
        };
        es.onerror = () => {
          try { es.close(); } catch {}
          esRef.current = null;
        };
      } catch {}
    })();
    try { window.addEventListener('credits-refresh', onCreditsRefresh as EventListener); } catch {}
    return () => {
      mounted = false;
      const es = esRef.current; if (es) { try { es.close(); } catch {} esRef.current = null; }
      try { window.removeEventListener('credits-refresh', onCreditsRefresh as EventListener); } catch {}
    };
  }, []);

  if (credits == null) return null;
  return (
    <div className="px-[0.6em] py-[0.3em] rounded-full text-[0.78rem] bg-primary text-black" title="Credits balance">
      {credits} credits
    </div>
  );
}


