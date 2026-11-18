/**
 * The two selectable backgrounds (DESIGN.md §Grounds): pure white and pure black. A ground moves
 * only the bare page behind the cards: its base colour (`--color-paper`, `--color-background`) and
 * the browser chrome. Cards, the matte hero surfaces and the dock keep their own colours. The same
 * hex values are written in `app/globals.css` (`html[data-ground]`);
 * `tests/design/grounds.test.ts` holds the two equal and checks contrast on both grounds.
 *
 * Earlier builds offered four tinted grounds (Porcelain "oat", Fern "sage", Blush "clay", Mist
 * "mist"). A stored choice from then still reads: `toGroundId` maps oat, sage and clay to White and
 * mist to Black, so nobody lands on a colour that no longer exists.
 */
export type GroundId = "white" | "black";

export type Ground = {
  id: GroundId;
  label: string;
  /** The bare page and the browser chrome colour. */
  base: string;
  /** The lighter wash at the top edge (flat: equal to the base). */
  lift: string;
  /** The darker wash in the lower right corner (flat: equal to the base). */
  shade: string;
};

export const GROUNDS: readonly Ground[] = [
  { id: "white", label: "White", base: "#ffffff", lift: "#ffffff", shade: "#ffffff" },
  { id: "black", label: "Black", base: "#000000", lift: "#000000", shade: "#000000" },
];

export const DEFAULT_GROUND: GroundId = "white";

/** Stored ids from the four-ground era, and the ground each one becomes. */
export const LEGACY_GROUNDS: Readonly<Record<string, GroundId>> = {
  oat: "white", sage: "white", clay: "white", mist: "black",
};

export function isGroundId(value: unknown): value is GroundId {
  return GROUNDS.some((g) => g.id === value);
}

/** A stored or painted value as a ground: current ids as they are, legacy ids mapped, else null. */
export function toGroundId(value: unknown): GroundId | null {
  if (isGroundId(value)) return value;
  return typeof value === "string" && Object.hasOwn(LEGACY_GROUNDS, value) ? LEGACY_GROUNDS[value] : null;
}

export function groundById(id: GroundId): Ground {
  return GROUNDS.find((g) => g.id === id) ?? GROUNDS[0];
}
