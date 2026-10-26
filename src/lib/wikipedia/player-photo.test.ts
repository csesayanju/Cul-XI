import { describe, expect, it, vi } from "vitest";

import {
  chooseCandidate,
  clubNeedle,
  findPlayerPhoto,
  nameTokens,
  normalise,
  photoFromImageInfo,
  stripHtml,
  type WikiSearchPage,
} from "./player-photo";

// Fictional search results shaped like the real API (formatversion=2).
const pages: WikiSearchPage[] = [
  {
    index: 2,
    title: "2026–27 FC Barcelona season",
    description: "Season of a football club",
    pageimage: "Season.jpg",
    extract: "The 2026–27 season is FC Barcelona's 128th season.",
  },
  {
    index: 1,
    title: "Àlex Serra",
    description: "Spanish footballer (born 2004)",
    pageimage: "Alex_Serra_2026.jpg",
    thumbnail: { source: "https://upload.example/thumb.jpg" },
    extract:
      "Àlex Serra is a Spanish professional footballer who plays as a defender for La Liga club Barcelona.",
  },
  {
    index: 3,
    title: "Àlex Serra (cyclist)",
    description: "Spanish cyclist",
    pageimage: "Cyclist.jpg",
    extract: "Àlex Serra is a Spanish road cyclist from Barcelona.",
  },
];

describe("text helpers", () => {
  it("normalises accents and punctuation", () => {
    expect(normalise("Àlex  Cubarsí-Paredes!")).toBe("alex cubarsi paredes");
  });

  it("keeps meaningful name tokens and drops initials", () => {
    expect(nameTokens("A. Gordon", "Anthony Gordon")).toEqual(["gordon", "anthony"]);
    expect(nameTokens("Pedri")).toEqual(["pedri"]);
  });

  it("reduces club names to the words an intro would mention", () => {
    expect(clubNeedle("FC Barcelona")).toBe("barcelona");
    expect(clubNeedle("Alavés")).toBe("alaves");
    expect(clubNeedle("Atlético Madrid")).toBe("atletico madrid");
  });

  it("strips HTML from Commons metadata", () => {
    expect(stripHtml('<a href="//x">Jane &amp; Co</a>&nbsp;Photo')).toBe("Jane & Co Photo");
  });
});

describe("chooseCandidate", () => {
  const player = { name: "À. Serra", fullName: "Àlex Serra", teamName: "Barcelona" };

  it("picks the footballer whose intro mentions the club", () => {
    expect(chooseCandidate(pages, player)?.title).toBe("Àlex Serra");
  });

  it("rejects namesakes who are not footballers", () => {
    const onlyCyclist = pages.filter((p) => p.title.includes("cyclist"));
    expect(chooseCandidate(onlyCyclist, player)).toBeNull();
  });

  it("rejects a footballer whose intro doesn't mention the club", () => {
    expect(chooseCandidate(pages, { ...player, teamName: "Aston Villa" })).toBeNull();
  });

  it("rejects lead images not named after the player (team, match or event photos)", () => {
    const eventPhoto = pages.map((p) =>
      p.title === "Àlex Serra" ? { ...p, pageimage: "P20260719_President_visits_club.jpg" } : p,
    );
    expect(chooseCandidate(eventPhoto, player)).toBeNull();
  });

  it("rejects pages without an image or with an unrelated title", () => {
    const noImage = pages.map((p) => ({ ...p, pageimage: undefined }));
    expect(chooseCandidate(noImage, player)).toBeNull();
    expect(chooseCandidate(pages, { name: "Pedri", teamName: "Barcelona" })).toBeNull();
  });
});

describe("photoFromImageInfo", () => {
  const info = {
    thumburl: "https://upload.example/thumb/240px-Alex.jpg",
    descriptionurl: "https://commons.example/wiki/File:Alex.jpg",
    extmetadata: {
      Artist: { value: '<a href="//commons">Jane Doe</a>' },
      LicenseShortName: { value: "CC BY-SA 4.0" },
    },
  };

  it("builds the photo with attribution", () => {
    expect(photoFromImageInfo(info)).toEqual({
      url: "https://upload.example/thumb/240px-Alex.jpg",
      credit: "Jane Doe · CC BY-SA 4.0",
      pageUrl: "https://commons.example/wiki/File:Alex.jpg",
    });
  });

  it("rejects files without a licence or marked non-free", () => {
    expect(photoFromImageInfo({ ...info, extmetadata: {} })).toBeNull();
    expect(
      photoFromImageInfo({
        ...info,
        extmetadata: { ...info.extmetadata, LicenseShortName: { value: "Fair use" } },
      }),
    ).toBeNull();
  });
});

describe("findPlayerPhoto", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it("searches Wikipedia, then reads the licence from Commons", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ query: { pages } }))
      .mockResolvedValueOnce(
        json({
          query: {
            pages: [
              {
                imageinfo: [
                  {
                    thumburl: "https://upload.example/240px.jpg",
                    descriptionurl: "https://commons.example/File:Alex_Serra_2026.jpg",
                    extmetadata: {
                      Artist: { value: "Jane Doe" },
                      LicenseShortName: { value: "CC BY 2.0" },
                    },
                  },
                ],
              },
            ],
          },
        }),
      );

    const photo = await findPlayerPhoto(
      { name: "À. Serra", fullName: "Àlex Serra", teamName: "Barcelona" },
      fetchMock,
    );
    expect(photo?.credit).toBe("Jane Doe · CC BY 2.0");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("File%3AAlex_Serra_2026.jpg");
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["user-agent"]).toMatch(/^CuleXI/);
  });

  it("returns null without a second request when nothing matches", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ query: { pages: [] } }));
    expect(await findPlayerPhoto({ name: "Nobody", teamName: "Barcelona" }, fetchMock)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects images that aren't on Commons", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ query: { pages } }))
      .mockResolvedValueOnce(json({ query: { pages: [{ missing: true }] } }));
    expect(
      await findPlayerPhoto(
        { name: "À. Serra", fullName: "Àlex Serra", teamName: "Barcelona" },
        fetchMock,
      ),
    ).toBeNull();
  });

  it("throws on HTTP errors so the lookup is retried later", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(
      findPlayerPhoto({ name: "X Y", teamName: "Barcelona" }, fetchMock),
    ).rejects.toThrow(/503/);
  });
});
