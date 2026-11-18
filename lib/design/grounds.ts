/**
 * The four selectable backgrounds (DESIGN.md §Grounds). A ground moves only the bare page behind the
 * cards: its base colour (`--color-paper`, `--color-background`), the lighter wash at the top and
 * the shade in the lower corner of `.harvest-ground`. Cards, the matte meal card and the dock keep
 * their own colours. The same hex values are written in `app/globals.css` (`html[data-ground]`);
 * `tests/design/grounds.test.ts` holds the two equal and checks contrast on every ground.
 */
export type GroundId = "oat" | "sage" | "clay" | "mist";

export type Ground = {
  id: GroundId;
  label: string;
  /** The bare page and the browser chrome colour. */
  base: string;
  /** The lighter wash at the top edge. */
  lift: string;
  /** The darker wash in the lower right corner. */
  shade: string;
};

export const GROUNDS: readonly Ground[] = [
  { id: "oat", label: "Porcelain", base: "#f2f2ef", lift: "#f8f8f6", shade: "#e8e8e4" },
  { id: "sage", label: "Fern", base: "#edf0eb", lift: "#f5f7f3", shade: "#e8ece5" },
  { id: "clay", label: "Blush", base: "#f3eeeb", lift: "#f8f5f3", shade: "#efe9e5" },
  { id: "mist", label: "Mist", base: "#eceff2", lift: "#f4f6f8", shade: "#e7ebef" },
];

export const DEFAULT_GROUND: GroundId = "oat";

export function isGroundId(value: unknown): value is GroundId {
  return GROUNDS.some((g) => g.id === value);
}

export function groundById(id: GroundId): Ground {
  return GROUNDS.find((g) => g.id === id) ?? GROUNDS[0];
}
