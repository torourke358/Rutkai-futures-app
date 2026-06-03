"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/import", label: "Import" },
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
      ? "rounded-md bg-indigo-500/15 px-2.5 py-1 font-semibold text-indigo-300 ring-1 ring-indigo-400/30"
      : "rounded-md px-2.5 py-1 text-slate-400 hover:text-slate-100";

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
        <Link
          href="/admin/audit"
          className={tabClass(isActive("/admin/audit"))}
        >
          Audit
        </Link>
      )}
      <Link
        href="/account/password"
        className={tabClass(isActive("/account/password"))}
      >
        Password
      </Link>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="rounded-md px-2.5 py-1 text-slate-400 hover:text-rose-300 disabled:opacity-60"
      >
        Sign out
      </button>
    </nav>
  );
}
