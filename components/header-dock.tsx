'use client';

import { useEffect, useMemo, useState } from 'react';
import Dock, { type DockItemData } from '@/components/ui/Dock';
import { Home, MessagesSquare, Wrench, Play, LayoutTemplate, Music2, Folder, Megaphone, ChartBarIncreasing } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function HeaderDock() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  

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
        { icon: <MessagesSquare size={16} />, label: 'Showroom', href: '/dashboard/showroom', onClick: () => router.push('/dashboard/showroom') },
        { icon: <Folder size={16} />, label: 'Workspace', href: '/dashboard/workspace', onClick: () => router.push('/dashboard/workspace') },
      ];
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
        { icon: <Folder size={16} />, label: 'Admin Workspace', href: qp('workspace'), onClick: () => router.push(qp('workspace')) },
      ];
    }
    return [];
  }, [mode, router, searchParams]);

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


