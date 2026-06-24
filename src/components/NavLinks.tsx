"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/import", label: "Import" },
  { href: "/engine", label: "Engine" },
  { href: "/strategy", label: "Strategy" },
  { href: "/paper", label: "Paper" },
  { href: "/whatif", label: "What-if" },
  { href: "/prop", label: "Prop" },
  { href: "/review", label: "Review" },
];

export default function NavLinks({ role }: { role: "trader" | "admin" }) {
  const pathname = usePathname() ?? "/";
  const [signingOut, setSigningOut] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
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
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={tabClass(isActive(t.href))}>
          {t.label}
        </Link>
      ))}
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
