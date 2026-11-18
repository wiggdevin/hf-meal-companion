// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import HfLogo, { hfLogoSrc } from "@/components/brand/HfLogo";

afterEach(cleanup);

describe("HfLogo", () => {
  it("reads High Frequency and picks the file for the surface it sits on", () => {
    render(<HfLogo variant="monogram" tone="dark" height={32} />);
    const img = screen.getByRole("img", { name: "High Frequency" });
    expect(img.getAttribute("src")).toContain("hf-monogram-on-dark.svg");
    expect(img.getAttribute("height")).toBe("32");
  });

  it("is decorative beside a visible name", () => {
    const { container } = render(<HfLogo decorative />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });

  it("auto draws both files and names the logo once", () => {
    const { container } = render(<HfLogo tone="auto" variant="monogram" />);
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: "High Frequency" })).toHaveLength(1);
  });

  it("every variant and tone has its file in public/brand", () => {
    for (const v of ["horizontal", "monogram"] as const) {
      for (const t of ["light", "dark"] as const) {
        expect(existsSync(join(process.cwd(), "public", hfLogoSrc(v, t))), `${v} ${t}`).toBe(true);
      }
    }
  });
});
