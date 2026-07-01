"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SubTab } from "@/lib/nav";

// Secondary tab bar rendered inside a grouped section (Recs, Analysis). Mirrors
// the primary nav's active styling so the two feel like one system.
export default function SubTabs({ tabs }: { tabs: SubTab[] }) {
  const pathname = usePathname() ?? "/";
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-line pb-2 text-sm font-medium">
      {tabs.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? "rounded-lg bg-accent/10 px-3 py-1 font-semibold text-accent"
                : "rounded-lg px-3 py-1 text-muted hover:bg-surface-2 hover:text-ink"
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
