'use client';

import { useEffect, useMemo, useState } from 'react';
import Dock, { type DockItemData } from '@/components/ui/Dock';
import { Home, MessagesSquare, Wrench, Radio, Play, LayoutTemplate, Music2, Folder, Megaphone, ChartBarIncreasing, Lock } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function HeaderDock() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await fetch('/api/me', { cache: 'no-store' }).then(r=>r.json());
        if (!alive) return;
        setPlan((me?.plan as string | null | undefined) || null);
        setRole((me?.role as string | null | undefined) || null);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const mode: 'dashboard' | 'admin' | null = useMemo(() => {
    if (!pathname) return null;
    if (pathname.startsWith('/dashboard')) return 'dashboard';
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
    return null;
  }, [pathname]);

  const items = useMemo(() => {
    if (mode === 'dashboard') {
      const arr: DockItemData[] = [
        { icon: <Home size={16} />, label: 'Home', href: '/dashboard/home', onClick: () => router.push('/dashboard/home') },
        { icon: <Play size={16} />, label: 'Hooks', href: '/dashboard/hooks', onClick: () => router.push('/dashboard/hooks') },
        { icon: <LayoutTemplate size={16} />, label: 'Templates', href: '/dashboard/templates', onClick: () => router.push('/dashboard/templates') },
        { icon: <Music2 size={16} />, label: 'Suggestions', href: '/dashboard/suggestions', onClick: () => router.push('/dashboard/suggestions') },
        { icon: <MessagesSquare size={16} />, label: 'Chat', href: '/dashboard/chat', onClick: () => router.push('/dashboard/chat') },
        { icon: <Folder size={16} />, label: 'Workspace', href: '/dashboard/workspace', onClick: () => router.push('/dashboard/workspace') },
      ];
      // Livestreams (locked on non-pro, but admins bypass)
      const isUnlocked = (plan === 'pro') || (role === 'admin');
      arr.splice(6, 0, {
        icon: (
          <div className="relative">
            <Radio size={16} />
            {!isUnlocked ? (
              <span aria-hidden className="absolute -bottom-1.5 -right-1.5 inline-flex items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)]/90" style={{ width: '0.9rem', height: '0.9rem' }}>
                <Lock className="opacity-80" style={{ width: '0.6rem', height: '0.6rem' }} />
              </span>
            ) : null}
          </div>
        ),
        label: 'Livestreams',
        href: isUnlocked ? '/dashboard/livestreams' : undefined,
        onClick: () => {
          if (isUnlocked) { router.push('/dashboard/livestreams'); return; }
          try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {}
        }
      });
      return arr;
    }
    if (mode === 'admin') {
      const qp = (tab: string) => {
        const sp = new URLSearchParams(searchParams?.toString() || '');
        sp.set('tab', tab);
        return `/admin?${sp.toString()}`;
      };
      const AnalyticsIcon = <ChartBarIncreasing size={16} />;
      return [
        { icon: AnalyticsIcon, label: 'Analytics', href: qp('analytics'), onClick: () => router.push(qp('analytics')) },
        { icon: <Megaphone size={16} />, label: 'Announcements', href: qp('announcements'), onClick: () => router.push(qp('announcements')) },
        { icon: <LayoutTemplate size={16} />, label: 'Templates', href: qp('templates'), onClick: () => router.push(qp('templates')) },
        { icon: <Music2 size={16} />, label: 'Music', href: qp('music'), onClick: () => router.push(qp('music')) },
        { icon: <Wrench size={16} />, label: 'Moderation', href: qp('moderation'), onClick: () => router.push(qp('moderation')) },
        { icon: <Folder size={16} />, label: 'Workspace', href: qp('workspace'), onClick: () => router.push(qp('workspace')) },
      ];
    }
    return [];
  }, [mode, router, searchParams, plan, role]);

  if (!mounted || !mode) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center overflow-visible">
      <div className="w-full flex justify-center overflow-visible">
        <div className="pointer-events-auto w-fit overflow-visible" style={{ height: 56 }}>
          <Dock items={items} panelHeight={56} baseItemSize={36} magnification={48} />
        </div>
      </div>
    </div>
  );
}


