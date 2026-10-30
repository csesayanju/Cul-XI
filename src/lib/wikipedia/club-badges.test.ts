import { describe, expect, it } from "vitest";

import { looksLikeBadge } from "./club-badges";

describe("looksLikeBadge", () => {
  it("accepts crests and logos", () => {
    expect(looksLikeBadge("Valencia_Cf_Logo_original.svg")).toBe(true);
    expect(looksLikeBadge("Arsenal_FC.svg")).toBe(true);
    expect(looksLikeBadge("Escudo_del_Sevilla_FC.png")).toBe(true);
    expect(looksLikeBadge("Paris_Saint-Germain_F.C._crest.png")).toBe(true);
  });

  it("rejects photos, kits and maps", () => {
    expect(looksLikeBadge("Estadio_Mestalla_2019.jpg")).toBe(false);
    expect(looksLikeBadge("Kit_body_valencia2324h.svg")).toBe(false);
    expect(looksLikeBadge("Team_photo_1999.jpg")).toBe(false);
  });
});
