import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static assets, images, the app's PWA files and the cron-protected APIs.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|offline|api/sync|api/maintenance|.*\\.(?:svg|png|jpg|ico|webp)$).*)",
  ],
};
