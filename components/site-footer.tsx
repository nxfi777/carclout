"use client";

import Link from "next/link";
import Image from "next/image";

export default function SiteFooter() {
  const socialLinks = [
    { name: "Instagram", href: "https://instagram.com/nytforge" },
    { name: "Kasra", href: "https://instagram.com/kasra_nyt" },
    { name: "Twitter", href: "https://twitter.com/nytforge" },
  ];

  return (
    <footer className="py-[2.5rem] px-[1rem] sm:px-[1.5rem] lg:px-[2rem] relative overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-col items-center relative z-10">
        <div className="flex items-center justify-center">
          <Link href="/" className="flex items-center justify-center">
            <Image src="/carcloutlogo.webp" alt="CarClout" width={48} height={48} className="rounded" />
          </Link>
        </div>

        <div className="my-[1rem] flex flex-wrap justify-center gap-4 text-sm">
          <Link href="/terms" className="text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] transition-colors duration-300 underline-offset-4 hover:underline">Terms</Link>
          <Link href="/privacy" className="text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] transition-colors duration-300 underline-offset-4 hover:underline">Privacy</Link>
          <Link href="/faq" className="text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] transition-colors duration-300 underline-offset-4 hover:underline">FAQ</Link>
        </div>

        <div className="mb-[1rem] flex flex-wrap justify-center gap-4 text-sm">
          {socialLinks.map((s) => (
            <a
              key={s.name}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.name}
              className="text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] transition-colors duration-300 underline-offset-4 hover:underline"
              href={s.href}
              data-umami-event="outbound-link-click"
              data-umami-event-url={s.href}
              data-umami-event-label={s.name}
            >
              {s.name}
            </a>
          ))}
        </div>

        <p className="text-center text-xs text-[color:var(--muted-foreground)] mt-[1rem]">
          &copy; {new Date().getFullYear()} CarClout. All rights reserved.
          <br />
          <span className="mt-[0.5rem] inline-block">
            Built by{" "}
            <a 
              href="https://nytforge.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-[color:var(--foreground)] transition-colors underline-offset-4 hover:underline"
              data-umami-event="outbound-link-click"
              data-umami-event-url="https://nytforge.com"
              data-umami-event-label="Nytforge"
            >
              Nytforge
            </a>
          </span>
        </p>
      </div>
    </footer>
  );
}


