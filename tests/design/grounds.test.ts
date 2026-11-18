import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_GROUND, GROUNDS, isGroundId, toGroundId } from "@/lib/design/grounds";
import { GROUND_BOOT_SCRIPT } from "@/lib/design/ground-boot";
import { THEME_COLOR, themeColorFor } from "@/lib/design/theme-color";
import { contrast, gradient, hexToRgb, MIN, ROLES, ROOT, token } from "./contrast-table";

const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const triple = (hex: string) => hexToRgb(hex).join(" ");

const lightRoles = ROLES.filter((r) => r.scope === "light" && r.id !== "text-text-faint");

/** The text roles `html[data-ground="black"]` writes for bare-page text, read from globals.css. */
const blackBlock = new RegExp('html\\[data-ground="black"\\] \\{([^}]*)\\}').exec(css)?.[1] ?? "";
const blackRole = (name: string) => {
  const m = new RegExp(`--color-${name}: (#[0-9a-f]{6});`).exec(blackBlock);
  if (!m) throw new Error(`black ground has no --color-${name}`);
  return hexToRgb(m[1]);
};

describe("selectable grounds (DESIGN.md §Grounds)", () => {
  it("offers White and Black, White first and equal to the token ground", () => {
    expect(GROUNDS.map((g) => g.id)).toEqual(["white", "black"]);
    expect(GROUNDS.map((g) => g.base)).toEqual(["#ffffff", "#000000"]);
    expect(DEFAULT_GROUND).toBe("white");
    expect(hexToRgb(GROUNDS[0].base)).toEqual(token("paper"));
    expect(hexToRgb(GROUNDS[0].base)).toEqual(token("background"));
    expect(THEME_COLOR).toBe(GROUNDS[0].base);
    expect(isGroundId("black")).toBe(true);
    expect(isGroundId("neon")).toBe(false);
  });

  it("a stored four-ground id still reads: oat, sage and clay are White, mist is Black", () => {
    expect(toGroundId("oat")).toBe("white");
    expect(toGroundId("sage")).toBe("white");
    expect(toGroundId("clay")).toBe("white");
    expect(toGroundId("mist")).toBe("black");
    expect(toGroundId("black")).toBe("black");
    expect(toGroundId("neon")).toBeNull();
    expect(toGroundId(undefined)).toBeNull();
  });

  it("the browser chrome colour follows the ground", () => {
    for (const g of GROUNDS) expect(themeColorFor(g.id)).toBe(g.base);
  });

  it("the pre-paint script knows every ground's chrome colour and the legacy ids", () => {
    for (const g of GROUNDS) expect(GROUND_BOOT_SCRIPT).toContain(`"${g.id}":"${g.base}"`);
    expect(GROUND_BOOT_SCRIPT).toContain('"mist":"black"');
    expect(GROUND_BOOT_SCRIPT).toContain('"oat":"white"');
  });

  it("globals.css writes the same colours as grounds.ts", () => {
    for (const g of GROUNDS.slice(1)) {
      const rule = new RegExp(`html\\[data-ground="${g.id}"\\] \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(rule, g.id).toContain(`--color-paper: ${g.base};`);
      expect(rule, g.id).toContain(`--color-background: ${g.base};`);
      expect(rule, g.id).toContain(`--ground-lift-rgb: ${triple(g.lift)};`);
      expect(rule, g.id).toContain(`--ground-shade-rgb: ${triple(g.shade)};`);
    }
    const root = /--ground-lift-rgb: ([\d ]+);\s*--ground-shade-rgb: ([\d ]+);/.exec(css)!;
    expect(root[1]).toBe(triple(GROUNDS[0].lift));
    expect(root[2]).toBe(triple(GROUNDS[0].shade));
    for (const g of GROUNDS) expect(css).toContain(`.ground-swatch-${g.id} {`);
  });

  it("both grounds are flat: no lift and no shade colour apart from the base", () => {
    for (const g of GROUNDS) {
      expect(g.lift).toBe(g.base);
      expect(g.shade).toBe(g.base);
    }
  });

  it("every light text role that may sit on the page meets its threshold on White", () => {
    const failures: string[] = [];
    const white = hexToRgb(GROUNDS[0].base);
    for (const role of lightRoles) {
      const worst = contrast(role.color, white);
      if (worst < MIN[role.use]) failures.push(`${role.id} on white: ${worst.toFixed(2)}:1 < ${MIN[role.use]}`);
    }
    expect(failures).toEqual([]);
  });

  it("the bare-page text roles on Black meet their thresholds", () => {
    const black = hexToRgb(GROUNDS[1].base);
    const roles: [string, number][] = [
      ["text-primary", MIN.text], ["text-secondary", MIN.text], ["text-muted", MIN.text],
      ["charcoal", MIN.text], ["graphite", MIN.text], ["muted", MIN.text], ["icon", MIN.icon],
    ];
    const failures: string[] = [];
    for (const [name, min] of roles) {
      const ratio = contrast(blackRole(name), black);
      if (ratio < min) failures.push(`${name} on black: ${ratio.toFixed(2)}:1 < ${min}`);
    }
    expect(failures).toEqual([]);
  });

  it("the card is separated from the White ground by its hairline, and steps off Black (DESIGN.md §Elevation)", () => {
    const border = token("border");
    expect(contrast(border, hexToRgb(GROUNDS[0].base))).toBeGreaterThanOrEqual(1.2);
    const failures: string[] = [];
    for (const stop of gradient("card")) {
      const ratio = contrast(stop, hexToRgb(GROUNDS[1].base));
      if (ratio < 1.1) failures.push(`black: ${ratio.toFixed(3)}:1`);
    }
    expect(failures).toEqual([]);
  });
});
