'use client';

import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Menu, Home, Play, LayoutTemplate, Music2, MessagesSquare, Folder, Radio, Megaphone, Wrench, Lock } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type DockItem = {
  icon: React.ReactNode;
  label: React.ReactNode;
  href?: string;
  onClick: () => void;
};

export default function HeaderDockMenu() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const items: DockItem[] = useMemo(() => {
    if (mode === 'dashboard') {
      const arr: DockItem[] = [
        { icon: <Home size={16} />, label: 'Home', href: '/dashboard/home', onClick: () => router.push('/dashboard/home') },
        { icon: <Play size={16} />, label: 'Hooks', href: '/dashboard/hooks', onClick: () => router.push('/dashboard/hooks') },
        { icon: <LayoutTemplate size={16} />, label: 'Templates', href: '/dashboard/templates', onClick: () => router.push('/dashboard/templates') },
        { icon: <Music2 size={16} />, label: 'Suggestions', href: '/dashboard/suggestions', onClick: () => router.push('/dashboard/suggestions') },
        { icon: <MessagesSquare size={16} />, label: 'Chat', href: '/dashboard/chat', onClick: () => router.push('/dashboard/chat') },
        { icon: <Folder size={16} />, label: 'Workspace', href: '/dashboard/workspace', onClick: () => router.push('/dashboard/workspace') },
      ];
      // Livestreams (locked on non-pro, admins bypass)
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
        label: isUnlocked ? 'Livestreams' : 'Livestreams 🔒',
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
      return [
        { icon: <Megaphone size={16} />, label: 'Analytics', href: qp('analytics'), onClick: () => router.push(qp('analytics')) },
        { icon: <Megaphone size={16} />, label: 'Announcements', href: qp('announcements'), onClick: () => router.push(qp('announcements')) },
        { icon: <LayoutTemplate size={16} />, label: 'Templates', href: qp('templates'), onClick: () => router.push(qp('templates')) },
        { icon: <Music2 size={16} />, label: 'Music', href: qp('music'), onClick: () => router.push(qp('music')) },
        { icon: <Wrench size={16} />, label: 'Moderation', href: qp('moderation'), onClick: () => router.push(qp('moderation')) },
        { icon: <Folder size={16} />, label: 'Workspace', href: qp('workspace'), onClick: () => router.push(qp('workspace')) },
      ];
    }
    return [];
  }, [mode, router, searchParams, plan, role]);

  if (!mode) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-full border border-[color:var(--border)] bg-[color:var(--popover)]/70 hover:bg-[color:var(--popover)]/90"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        alignOffset={-9999}
        collisionPadding={8}
        className="rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)]/90 backdrop-blur p-2 shadow-xl w-[min(88vw,18rem)] max-w-[min(88vw,18rem)] text-right"
      >
        {items.map((item, idx) => (
          <DropdownMenuItem
            key={idx}
            className="px-2 py-2 justify-between cursor-pointer"
            onSelect={(e)=>{ e.preventDefault(); try { setOpen(false); if (typeof item.onClick === 'function') { item.onClick(); } else if (item.href) { window.location.assign(item.href); } } catch {} }}
          >
            <span className="text-sm mr-3 grow text-right">{item.label}</span>
            <div className="size-9 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] shadow-sm flex items-center justify-center">
              {item.icon}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


