import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Fantasy rules now live inside Fantasy.
  async redirects() {
    return [{ source: "/rules", destination: "/matches/rules", permanent: false }];
  },
  experimental: {
    // Keep pages the user just visited in the client router cache, so switching back to a
    // tab is instant. Saving a team / admin actions call revalidatePath, which clears it.
    staleTimes: { dynamic: 60, static: 300 },
  },
};

export default nextConfig;
