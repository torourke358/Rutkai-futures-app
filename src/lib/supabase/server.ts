import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cleanEnv } from "@/lib/supabase/env";

// Server-side Supabase client for Server Components, Server Actions, and
// Route Handlers. RLS runs as the logged-in user. `cookies()` is async in
// Next 16.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server-Component reads are cookie-read-only; the proxy already
            // refreshed the session, so swallowing is safe.
          }
        },
      },
    },
  );
}

// Service-role client. Bypasses RLS — server code only. Used for audit_log
// writes and trusted post-pairing UPSERTs.
export function createServiceClient() {
  return createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    },
  );
}
