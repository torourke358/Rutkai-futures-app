import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cleanEnv } from "@/lib/supabase/env";

// Refresh the Supabase auth session on every request and keep cookies in
// sync. In Next 16, middleware is renamed to "proxy" (nodejs runtime).
// IMPORTANT: do not run logic between createServerClient and getUser().
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === "/login";
  const isPublicAsset =
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icon-") ||
    pathname === "/favicon.ico";
  // The regulatory-design page is meant to be shareable with counsel, who may
  // not have an account — keep /about/* readable without auth.
  const isPublicRoute = pathname.startsWith("/about");

  function redirectTo(p: string) {
    const url = request.nextUrl.clone();
    url.pathname = p;
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  }

  if (!user && !isAuthRoute && !isPublicAsset && !isPublicRoute) return redirectTo("/login");
  if (user && isAuthRoute) return redirectTo("/dashboard");

  return supabaseResponse;
}
