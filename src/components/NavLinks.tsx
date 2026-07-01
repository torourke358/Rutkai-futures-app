"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasFeature, type Tier } from "@/lib/billing/tiers";
import { PRIMARY_TABS } from "@/lib/nav";

export default function NavLinks({ role, tier }: { role: "trader" | "admin"; tier: Tier }) {
  const pathname = usePathname() ?? "/";
  const [signingOut, setSigningOut] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }
  // A grouped primary tab lights up for any of its member routes.
  function isActiveGroup(prefixes: string[]) {
    return prefixes.some((p) => isActive(p));
  }
  const tabClass = (active: boolean) =>
    active
      ? "rounded-lg bg-accent/10 px-2.5 py-1 font-semibold text-accent"
      : "rounded-lg px-2.5 py-1 text-muted hover:bg-surface-2 hover:text-ink";

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm font-medium">
      {PRIMARY_TABS.map((t) => {
        const locked = !hasFeature(tier, t.feature);
        if (locked) {
          return (
            <Link
              key={t.href}
              href="/upgrade"
              title={`${t.label} is a paid feature — upgrade to unlock`}
              className="rounded-lg px-2.5 py-1 text-muted/60 hover:text-ink"
            >
              {t.label} <span aria-hidden>🔒</span>
            </Link>
          );
        }
        return (
          <Link key={t.href} href={t.href} className={tabClass(isActiveGroup(t.match))}>
            {t.label}
          </Link>
        );
      })}
      {role === "admin" && (
        <Link href="/admin/audit" className={tabClass(isActive("/admin/audit"))}>
          Audit
        </Link>
      )}
      <Link href="/account/password" className={tabClass(isActive("/account/password"))}>
        Password
      </Link>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="rounded-md px-2.5 py-1 text-muted hover:text-loss disabled:opacity-60"
      >
        Sign out
      </button>
    </nav>
  );
}
