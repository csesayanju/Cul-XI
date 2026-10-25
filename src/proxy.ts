import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static assets, images and the cron-protected sync API.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/sync|.*\\.(?:svg|png|jpg|ico|webp)$).*)",
  ],
};
