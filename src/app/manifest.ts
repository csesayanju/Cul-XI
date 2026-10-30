import type { MetadataRoute } from "next";

/** Makes Culé XI installable (Add to Home Screen / Install app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Culé XI — Barça fantasy & trivia",
    short_name: "Culé XI",
    description: "Fantasy football for every Barça match, plus daily football trivia.",
    id: "/",
    start_url: "/matches",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#060f24",
    theme_color: "#0f2f6b",
    categories: ["sports", "games"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Fantasy", url: "/matches", icons: [{ src: "/icons/192", sizes: "192x192" }] },
      { name: "Daily trivia", url: "/trivia", icons: [{ src: "/icons/192", sizes: "192x192" }] },
      {
        name: "Leaderboard",
        url: "/leaderboard",
        icons: [{ src: "/icons/192", sizes: "192x192" }],
      },
    ],
  };
}
