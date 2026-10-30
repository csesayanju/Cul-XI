import { appIcon } from "../app-icon";

/** PNG app icons for the web app manifest: /icons/192, /icons/512 (?maskable=1). */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size === "512" ? 512 : 192;
  const maskable = new URL(request.url).searchParams.has("maskable");
  const res = appIcon(px, { maskable });
  res.headers.set("cache-control", "public, max-age=604800, immutable");
  return res;
}
