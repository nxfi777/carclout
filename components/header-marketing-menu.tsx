'use client';

import React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu } from 'lucide-react';

export default function HeaderMarketingMenu() {
  const [open, setOpen] = useState(false);

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
        <DropdownMenuItem
          className="px-2 py-2 cursor-pointer"
          onSelect={()=>{ try { setOpen(false); } catch {} }}
          asChild
        >
          <Link href="/auth/signin" className="block w-full text-sm text-right">Sign in</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-2 py-2 cursor-pointer"
          onSelect={()=>{ try { setOpen(false); } catch {} }}
          asChild
        >
          <Link href="/auth/signup" className="block w-full text-sm text-right">Get Started</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-2 py-2 cursor-pointer"
          onSelect={()=>{ try { setOpen(false); } catch {} }}
          asChild
        >
          <Link href="/pricing" className="block w-full text-sm text-right">Pricing</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-2 py-2 cursor-pointer"
          onSelect={()=>{ try { setOpen(false); } catch {} }}
          asChild
        >
          <Link href="/contact" className="block w-full text-sm text-right">Contact</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


