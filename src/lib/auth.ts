import { createClient } from "@/lib/supabase/server";

export type Role = "trader" | "admin";

// Look up the current user's role from user_profiles, returning null when
// not signed in. Server-only — uses the SSR-bound Supabase client.
export async function getUserRole(): Promise<Role | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: Role }>();

  return data?.role ?? "trader";
}
