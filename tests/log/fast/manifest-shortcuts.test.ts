/** Fast logging: the installed app offers its log captures from the home-screen icon and the share sheet. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../public/manifest.webmanifest"), "utf8"));

describe("manifest.webmanifest", () => {
  it("offers voice, photo and barcode shortcuts through /log", () => {
    const byUrl = Object.fromEntries(manifest.shortcuts.map((s: { url: string; name: string }) => [s.url, s.name]));
    expect(byUrl).toEqual({
      "/log?mode=voice": "Log by voice",
      "/log?mode=photo": "Photo of a meal",
      "/log?mode=barcode": "Scan a barcode",
    });
    for (const shortcut of manifest.shortcuts) expect(shortcut.icons?.[0]?.src).toMatch(/^\/icon-/);
  });

  it("takes a shared image into the photo capture", () => {
    expect(manifest.share_target).toEqual({
      action: "/log/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { files: [{ name: "image", accept: ["image/*"] }] },
    });
  });
});
