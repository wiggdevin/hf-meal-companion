import { APP_NAME } from "@/lib/brand";

/**
 * The High Frequency logo (DESIGN.md §Overview). One component for every place the brand shows:
 * `horizontal` is the full lockup, `monogram` the HF letters alone. `tone` names the surface the
 * logo sits on, not the logo's own colour: `light` (a white page or card) draws the Patchwork H in ink, teal and clay,
 * `dark` (the black ground, the dock, a matte hero surface) draws the bone, teal and clay one. The SVGs
 * live in `public/brand/`; they are served as they are, never run through the image optimiser.
 * `height` is in px (the width follows the artwork's ratio); the logo is decorative when a
 * visible name sits beside it (`decorative`), else it reads "High Frequency". `tone="auto"` is for
 * the bare page: it draws both files and `html[data-ground]` (app/globals.css, `.hf-logo-*`) shows the
 * one that fits the chosen ground.
 */
export type HfLogoVariant = "horizontal" | "monogram";
export type HfLogoTone = "light" | "dark" | "auto";

/** viewBox width / height of each artwork (public/brand/*.svg). */
const RATIO: Record<HfLogoVariant, number> = { horizontal: 582.39 / 100, monogram: 1 };

export function hfLogoSrc(variant: HfLogoVariant, tone: Exclude<HfLogoTone, "auto">): string {
  return `/brand/hf-${variant}-on-${tone}.svg`;
}

export default function HfLogo({
  variant = "horizontal",
  tone = "light",
  height = 28,
  decorative = false,
  className,
}: {
  variant?: HfLogoVariant;
  tone?: HfLogoTone;
  height?: number;
  decorative?: boolean;
  className?: string;
}) {
  const width = Math.round(height * RATIO[variant]);
  const one = (t: Exclude<HfLogoTone, "auto">, extra?: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG in public/; the optimiser adds nothing
    <img
      key={t}
      src={hfLogoSrc(variant, t)}
      alt={decorative || extra ? "" : APP_NAME}
      aria-hidden={decorative || extra ? true : undefined}
      width={width}
      height={height}
      className={[className, extra].filter(Boolean).join(" ") || undefined}
      data-hf-logo={variant}
      data-tone={t}
      draggable={false}
    />
  );
  if (tone !== "auto") return one(tone);
  // Both files, one visible: the ground picks. The first carries the name, the twin is hidden.
  return (
    <span className="hf-logo-auto" role={decorative ? undefined : "img"} aria-label={decorative ? undefined : APP_NAME}
      aria-hidden={decorative ? true : undefined}>
      {one("light", "hf-logo-on-light")}
      {one("dark", "hf-logo-on-dark")}
    </span>
  );
}
