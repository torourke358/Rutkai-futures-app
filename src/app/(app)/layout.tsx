import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import NavLinks from "@/components/NavLinks";

// Protected shell. Proxy redirects unauthenticated traffic; this guards
// direct server renders too.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = (await getUserRole()) ?? "trader";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold text-slate-100">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-indigo-500/20 text-xs font-bold text-indigo-300">
              T
            </div>
            Thor
          </div>
          <NavLinks role={role} />
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}
