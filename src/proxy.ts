import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except Next internals, static assets, and /api/*.
    // API routes do their own auth check; running the proxy on them adds
    // round-trip latency for no benefit.
    "/((?!_next/static|_next/image|favicon.ico|api/|icons/|manifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
