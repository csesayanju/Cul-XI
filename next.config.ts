import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Keep pages the user just visited in the client router cache, so switching back to a
    // tab is instant. Saving a team / admin actions call revalidatePath, which clears it.
    staleTimes: { dynamic: 60, static: 300 },
  },
};

export default nextConfig;
