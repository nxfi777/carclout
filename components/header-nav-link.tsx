"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface HeaderNavLinkProps {
  href: string;
  children: React.ReactNode;
}

export default function HeaderNavLink({ href, children }: HeaderNavLinkProps) {
  const pathname = usePathname();
  const isHidden = pathname?.startsWith("/dashboard") || pathname?.startsWith("/admin");
  if (isHidden) return null;
  const isHashLink = href.includes("#");
  const hrefPath = (href.split("#")[0] || "/").trim();
  const isActive = !isHashLink && hrefPath !== "/" && pathname === hrefPath;
  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    if (!isHashLink) return; // allow normal nav for non-hash routes
    const hash = href.split("#")[1];
    if (!hash) return;
    const target = document.getElementById(hash);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    // Update the hash without full navigation
    const newUrl = `${window.location.pathname}#${hash}`;
    history.pushState(null, "", newUrl);
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      aria-current={isActive ? "page" : undefined}
      className={clsx(
        "text-xs sm:text-sm uppercase tracking-widest font-medium",
        isActive
          ? "text-[color:var(--primary)]"
          : "text-[color:var(--foreground)]/80 hover:text-[color:var(--primary)]"
      )}
    >
      {children}
    </Link>
  );
}


