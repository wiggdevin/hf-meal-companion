---
version: "alpha"
name: "High Frequency Meal Companion"
description: "Phone-first nutrition PWA for multiple accounts, each with a plan derived from that account's foods, preferences, and targets. High Frequency (2026-11-18): Devin's approved HF app mockup (brand v2, Patchwork H). Pure white and black grounds only, white cards with a neutral hairline and a very soft shadow, basalt black hero surfaces (the dock, the Today hero card), flat ink for every action, clay as the warm accent, teal only for the logo piece, the protein bar, small link text and focus rings, Archivo display over Inter with tabular figures and Instrument Serif italic as the accent word. No green, no purple, no brown, oat or beige."
colors:
  primary: "#141A19"
  secondary: "#F2F2F0"
  tertiary: "#1C716E"
  neutral: "#FFFFFF"
  background: "#FFFFFF"
  surface: "#FFFFFF"
  text-primary: "#141A19"
  text-secondary: "#3A403E"
  text-muted: "#5B5F5B"
  text-faint: "#6A6E6A"
  border: "#E6E6E3"
  accent: "#B5562F"
  clay: "#B5562F"
  clay-300: "#E3A383"
  clay-100: "#F4E1D5"
  link: "#1C716E"
  olive-deep: "#0B0F0E"
  olive-shell-top: "#141A19"
  olive-shell-bottom: "#141A19"
  charcoal: "#141A19"
  charcoal-deep: "#0F1413"
  ink-button-top: "#141A19"
  ink-button-bottom: "#141A19"
  gauge-calories: "#141A19"
  gauge-calories-end: "#141A19"
  gauge-protein: "#3DB8B4"
  gauge-protein-end: "#72CCC7"
  gauge-carbs: "#E3A383"
  gauge-carbs-end: "#F0C7B0"
  gauge-fat: "#9AA19C"
  gauge-fat-end: "#C9CCC6"
  gauge-water: "#5F86A3"
  gauge-water-end: "#A9C2D3"
  yellow: "#D9A23A"
  yellow-ink: "#8A5A0B"
  yellow-wash: "#FBF0D9"
  orange: "#B5562F"
  orange-ink: "#8E3F1F"
  orange-wash: "#F4E1D5"
  orange-warm: "#E3A383"
  sage: "#141A19"
  sage-ink: "#1C716E"
  sage-wash: "#F2F2F0"
  field: "#F6F6F4"
  red: "#C4342B"
  red-ink: "#B3261E"
  red-wash: "#FBE9E7"
  on-olive: "#FFFFFF"
  on-olive-muted: "#9AA19C"
  on-charcoal: "#141A19"
  kcal-on-ink: "#E3A383"
  protein-on-ink: "#52C0BC"
  on-charcoal-muted: "#5B5F5B"
typography:
  display-lg:
    fontFamily: "Archivo"
    fontSize: "64px"
    fontWeight: 600
    lineHeight: "64px"
    letterSpacing: "-0.03em"
  display-md:
    fontFamily: "Archivo"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: "44px"
    letterSpacing: "-0.025em"
  heading-sm:
    fontFamily: "Archivo"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
    letterSpacing: "-0.015em"
  numeral-xl:
    fontFamily: "Archivo"
    fontSize: "48px"
    fontWeight: 600
    lineHeight: "48px"
    letterSpacing: "-0.03em"
  numeral-lg:
    fontFamily: "Archivo"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: "36px"
    letterSpacing: "-0.025em"
  numeral-md:
    fontFamily: "Archivo"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.015em"
  body-md:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "-0.005em"
  body-sm:
    fontFamily: "Inter"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
  label-md:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "-0.005em"
  eyebrow:
    fontFamily: "Inter"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.12em"
    textTransform: "uppercase"
  eyebrow-sm:
    fontFamily: "Inter"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: "14px"
    letterSpacing: "0.08em"
    textTransform: "uppercase"
rounded:
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  full: "9999px"
spacing:
  base: "4px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  gap: "16px"
  card-padding: "20px"
  section-padding: "16px"
components:
  button-primary:
    textColor: "#FFFFFF"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "0 20px"
  button-olive:
    textColor: "{colors.on-olive}"
    typography: "{typography.eyebrow-sm}"
    rounded: "{rounded.full}"
    padding: "0 6px 0 18px"
  card:
    rounded: "{rounded.xl}"
    padding: "20px"
  pill:
    rounded: "{rounded.full}"
    padding: "8px 14px"
---
## Overview

**High Frequency (2026-11-18, current).** The app is High Frequency Meal Companion, built from Devin's
approved HF mockup (`/Users/zero-suminc./projects/clients/high-frequency-app/high-frequency-refined/client-facing/brand-v2/`,
`app/png/*.png`, `app/app.css`). The tagline is "Fuel for the work." The look is a white page, white
premium cards with a hairline, one black hero object per screen, and food photography as the only
large colour. It is a 390 px phone app first.

- **Pages are pure white `#FFFFFF` or pure black `#000000`**, never a tint: no grey, oat, porcelain,
  beige or brown ground. Settings › Background offers exactly these two (§Techniques, Grounds).
- **Black is for hero surfaces:** the dock, the Today hero card (`CardFrame tone="ink"`), the meal
  card's macro panel and the hero area of a sheet. The matte is basalt `#1C2220 → #141917`, flat.
- **Cards on white are white** with an `#E6E6E3` hairline and a soft shadow; recessed tiles are
  `#F2F2F0`.
- **Ink `#141A19` is the action colour:** text, primary buttons (ink pills) and the active-tab capsule.
  On a black page the primary pill turns bone `#F2EDE4` with ink text.
- **Teal is the logo and the protein hue.** Fills and dots use `#3DB8B4`. Teal *text* is `#1C716E` on
  white (`text-link`, `--color-link`) and `#52C0BC` on black. Teal never washes a whole surface.
- **Clay `#B5562F`** (clay-300 `#E3A383`, clay-100 `#F4E1D5`) is the single warm accent: calorie
  figures (`.kcal`, ink `#8E3F1F` on white, `#E3A383` on black), the carbs bar, the logo's second
  stroke, an accent mark. **Bone `#F2EDE4`** is the light content on black. **Ash `#9AA19C`** is fat
  and muted content on black.
- **Macro hues are fixed data colours:** calories ink (bone on black), protein teal, carbs clay-300,
  fat ash, water slate blue `#5F86A3`. Fills and dots, never headings. **No green and no purple
  anywhere**; warning is amber ink `#8A5A0B`, danger is `#B3261E`.
- **Type:** Archivo (display and every numeral, tight tracking, tabular figures), Inter (body,
  labels), Instrument Serif italic (a rare accent, `.font-accent`). Loaded with `next/font/local` from
  `app/fonts/`; the CSS variable names (`--font-display-face`, `--font-text-face`,
  `--font-accent-face`) are unchanged.
- **Mark:** the Patchwork H (`public/brand/hf-*.svg`, `components/brand/HfLogo.tsx`): ink, teal and
  clay strokes on light; bone, teal and clay on dark. The coach mark is the HF monogram
  (`components/coach/SashaMark.tsx`, name kept). App icons and the favicon come from the HF set.

Token names are unchanged from Harvest and Porcelain; only their values moved (`paper`, `fog`,
`graphite`, `charcoal`, `muted`, `tangerine`, `plum`, `amber`...). The older prose below is history:
where it names oat, olive, ivory, beige trays, cream, Fraunces, Newsreader, Geist or Plus Jakarta
Sans, read the High Frequency white ground, ink, white card, recess tile, bone-on-black and Archivo
and Inter.

- **Composition cues:** Layout: single column, phone-first · Content width: 390 px with 16 px gutters ·
  Framing: white cards and black hero surfaces on a white ground · Grid: 4 px rhythm.

## Colors

Ground white `#FFFFFF` (or black `#000000`, §Techniques). Cards white with an `#E6E6E3` hairline;
recessed tiles, trays, wells and insets `#F2F2F0`; fields `#F6F6F4`. Text on light is ink: `#141A19`
primary, `#3A403E` secondary, `#5B5F5B` muted, `#6A6E6A` faint (on a white card or field only).
Hairlines are ink at 10 %.

**Matte black** (basalt `#1C2220 → #141917`, flat, no grain) is for the dock, the Today hero card
(`CardFrame tone="ink"`), the meal card's macro panel and a sheet's hero area (§Elevation). Inside it,
text is bone `#F2EDE4` for titles and values, `#D9D4CA` secondary, `#9AA19C` muted; the `.matte` scope
in `app/globals.css` remaps the text tokens so components keep their class names. A hairline on it is
white at 12 %.

**Primary** ink `#141A19` (`--grad-ink`, flat) with white content: every main action, the dock's
active capsule, chosen chips and the user's chat bubble. Secondary actions are pills with a faint ink
tint and a hairline (§Buttons); tertiary actions are recess. On a black ground the primary fill turns
bone with ink text (`html[data-ground="black"]`); the black hero surfaces keep their ink fill there.

**Teal** `#3DB8B4` (fill and dot; protein), link text `#1C716E` on white and `#52C0BC` on black.
**Clay** `#B5562F` (300 `#E3A383`, 100 `#F4E1D5`, ink `#8E3F1F`) is the accent and the calorie figure.
**Danger** `#B3261E` (wash `#FBE9E7`) is alerts, errors and live only. **Amber** `#D9A23A` (ink
`#8A5A0B`, wash `#FBF0D9`) marks pending and "needs a look". No green, no purple, no brown.

**Section hue** (`--section-rgb`, from `components/SectionHue.tsx`) colours section headings, the eaten
tint and the coach's bubble tint; every hue is ink, teal ink, clay ink or slate.

Gauges, fixed per macro: **calories** ink (bone on black), **protein** teal `#3DB8B4 → #72CCC7`,
**carbs** clay-300 `#E3A383 → #F0C7B0`, **fat** ash `#9AA19C → #C9CCC6`, **water** slate blue
`#5F86A3 → #A9C2D3`. A gauge hue is for arcs, bars and dots; small text stays ink or white.

**Calorie figures are clay.** Every calorie *number* carries the shared `.kcal` class
(`app/globals.css`) and one weight step more than its line: clay ink `#8E3F1F` on white, recess and
fields (at least 4.5:1), clay-300 `#E3A383` inside the `.matte` black scope (`.matte-reset` trays go
back to the ink). The "kcal" unit stays muted, a row over its target keeps the danger red, and the
macro gauges keep their own gauge colours. Lines that print "537 kcal ..." wrap the number with
`components/ui/KcalText.tsx`.

**Roles for components** (token names are what a component writes): page `bg-paper`; black hero
`.matte` / `CardFrame tone="ink"`; card `.surface` / `CardFrame`; card hairline `border-hairline`;
recessed tile `bg-fog` / `.well`; primary button `.btn-primary`; light pill on dark `.btn-primary` inside `.matte` (bone with ink text), `.btn-secondary` for the quiet one; teal link text `text-link`; clay accent `text-orange-ink`
(`.kcal`); muted text `text-muted`.

Never more than one accent in a single control; they mark meaning, not decoration.

Every colour a component uses is a token (`app/design-tokens.css` exported from this file, role
colours and recipes in `app/globals.css`); ESLint rejects a hex or tinted `rgb()` literal in `app/` or
`components/`. The browser chrome colour is `lib/design/theme-color.ts` (= the ground).

### Contrast

**The rule (2026-10-04, kept).** Every text role meets WCAG 2.2 AA on every surface it may sit on:
**≥ 4.5:1 for body and small text**, **≥ 3:1 for large text (≥ 24 px, or ≥ 18.66 px at 700) and for
icons**. `tests/design/contrast.test.ts` computes each pair from the token hex values
(`app/design-tokens.css`, `app/globals.css`, including the `.matte` / `.matte-reset` remaps, the
section hues, gradient stops and tint alphas), so a token edit that breaks a pair fails CI.
`tests/design/contrast-scan.test.ts` rejects the class combinations that draw a forbidden pair.

- **Light surfaces take ink.** White cards, recess, field, the washes, `.well`, `.surface`, `.notice`
  and `.matte-reset` trays: `text-charcoal`, `text-graphite`, `text-muted`, and the ink shades
  (`text-alert`, `text-warning`, `.kcal`, `text-link`). `text-text-faint` is for a white card and
  field only.
- **Bone is for the matte.** `text-on-primary` / `text-on-selected` only with an ink fill under them
  (`btn-primary`, `bg-primary`, `chip-on`, a lens). `text-on-olive` is never written in a component:
  inside `.matte`, `text-charcoal` already turns bone.
- **Gauge hues are fills, not text.** `.macro-*`, `text-gauge-*`, `text-yellow` and the warm clay rim
  draw arcs, bars, dots and rims. A macro figure as text uses `.macro-ink-kcal|protein|carbs|fat` (the
  ink shade on light, the gauge hue or its lighter end in the matte). Teal and slate blue fail as
  small text on white, so the forbidden list stays true.
- **The HF recolour (2026-11-18)** moved every pair at once: teal text on white is the darker
  `#1C716E` (5.6:1), clay figures are `#8E3F1F`, and the recess `#F2F2F0` keeps the card/inset step
  at least 1.2:1 against white (`tests/design/surface-step.test.ts`).

The table below is generated (`npx tsx tests/design/print-contrast-table.ts`) and checked against the
code by the test; each role shows its worst allowed surface.

<!-- contrast-table:start -->
| Role | Use | Worst allowed surface | Contrast |
|---|---|---|---|
| text-charcoal / text-text-primary | text (≥ 4.5) | tomato wash | 13.91:1 |
| text-graphite / text-text-secondary | text (≥ 4.5) | tomato wash | 8.36:1 |
| text-muted / text-text-muted / text-text-hint | text (≥ 4.5) | tomato wash | 5.13:1 |
| text-text-faint | text (≥ 4.5) | field | 4.79:1 |
| text-alert / text-red-ink | text (≥ 4.5) | tomato wash | 5.16:1 |
| text-warning / text-amber / text-yellow-ink | text (≥ 4.5) | tomato wash | 4.67:1 |
| .kcal / .macro-ink-kcal (tomato ink) | text (≥ 4.5) | tomato wash | 5.75:1 |
| text-sage-ink / .macro-ink-carbs | text (≥ 4.5) | tomato wash | 4.56:1 |
| text-plum / .macro-ink-protein | text (≥ 4.5) | tomato wash | 4.56:1 |
| text-primary (ink as text) | text (≥ 4.5) | tomato wash | 13.91:1 |
| section hue: body | text (≥ 4.5) | tomato wash | 13.91:1 |
| section hue: foods | text (≥ 4.5) | tomato wash | 13.91:1 |
| section hue: coach | text (≥ 4.5) | tomato wash | 13.91:1 |
| section hue: settings | text (≥ 4.5) | tomato wash | 8.36:1 |
| section hue: today | text (≥ 4.5) | tomato wash | 13.91:1 |
| text-icon (line icons) | icon (≥ 3) | tomato wash | 7.04:1 |
| text-on-primary / text-on-selected | text (≥ 4.5) | ink fill (primary) | 17.62:1 |
| text-on-olive on the olive fill | text (≥ 4.5) | ink fill (primary) | 17.62:1 |
| text-on-olive-muted (glyphs only) | icon (≥ 3) | ink fill (primary) | 6.67:1 |
| .matte text-charcoal | text (≥ 4.5) | .olive-panel in .matte | 13.53:1 |
| .matte text-graphite | text (≥ 4.5) | .olive-panel in .matte | 10.69:1 |
| .matte text-muted | text (≥ 4.5) | .olive-panel in .matte | 5.98:1 |
| .matte text-text-faint | text (≥ 4.5) | .olive-panel in .matte | 4.89:1 |
| .matte text-on-olive | text (≥ 4.5) | .olive-panel in .matte | 13.53:1 |
| .matte .kcal / .macro-ink-kcal | text (≥ 4.5) | charcoal matte | 7.57:1 |
| .matte .olive-panel .kcal | text (≥ 4.5) | .olive-panel in .matte | 7.39:1 |
| .matte .macro-ink-protein | text (≥ 4.5) | .olive-panel in .matte | 7.23:1 |
| .matte .macro-ink-carbs | text (≥ 4.5) | .olive-panel in .matte | 7.39:1 |
| .matte .macro-ink-fat | text (≥ 4.5) | .olive-panel in .matte | 5.98:1 |
| .matte text-icon | icon (≥ 3) | .olive-panel in .matte | 9.72:1 |
| plan glyph ink: breakfast | icon (≥ 3) | plan header glyph | 4.71:1 |
| plan glyph ink: lunch | icon (≥ 3) | plan header glyph | 4.67:1 |
| plan glyph ink: dinner | icon (≥ 3) | plan header glyph | 9.64:1 |
| plan glyph ink: snack | icon (≥ 3) | plan header glyph | 4.15:1 |
| plan glyph ink: other | icon (≥ 3) | plan header glyph | 4.28:1 |
| notice title (info / success) | text (≥ 4.5) | notice info / success | 5.15:1 |
| notice body (graphite) | text (≥ 4.5) | notice error | 9.03:1 |
| notice mark (tone ink) | icon (≥ 3) | notice info / success | 5.15:1 |
| notice title (attention) | text (≥ 4.5) | notice attention | 5.23:1 |
| notice title (error) | text (≥ 4.5) | notice error | 5.58:1 |
| notice title (neutral) | text (≥ 4.5) | notice neutral | 15.72:1 |
| armed danger label | text (≥ 4.5) | btn-danger armed | 6.54:1 |
| neutral tag (text-graphite) | text (≥ 4.5) | neutral tag on coach bubble | 8.08:1 |
| .matte neutral tag | text (≥ 4.5) | neutral tag in the matte | 9.35:1 |

| Forbidden pair | On | Contrast | Instead |
|---|---|---|---|
| text-on-olive (cream) | .olive-panel on ivory | 1.14:1 | the Settings protein card bug: cream on a 7 % tint; use ink (`text-charcoal`) |
| text-on-olive (cream) | white card | 1.00:1 | cream is for the olive fill and the matte only |
| text-on-primary | white card | 1.00:1 | `text-on-primary` needs the olive fill under it (`btn-primary`, `bg-primary`, a lens) |
| text-on-primary | tray (.well) | 1.12:1 | `text-on-primary` on a well or pill track |
| gauge carbs (.macro-carbs) as text | white card | 2.06:1 | gauge hues are fills and dots; text uses `.macro-ink-*` |
| gauge fat (.macro-fat, text-yellow) as text | white card | 2.55:1 | use `text-yellow-ink` or `.macro-ink-fat` |
| gauge protein (.macro-protein) as text | white card | 2.33:1 | teal is a fill and a dot on white; teal text is `text-link` (the darker teal) |
| gauge water (.macro-water) as text | white card | 3.74:1 | slate blue is a fill; water text is ink |
| warm orange rim (text-orange-warm) | white card | 2.06:1 | rims only |
| white on clay or teal fill (text) | clay-300 / teal fill (macro bars) | 2.14:1 | labels on a clay-300 or teal fill are ink |
| text-text-faint | hairline fill | 4.14:1 | faint is for the white card and field |
<!-- contrast-table:end -->

## Typography

**Archivo** at weight 600 with tight tracking is the display voice and every numeral: screen titles,
section headings, meal titles and the big figures (tabular figures kept, `.numeral`). **Inter** carries
everything else: body 400 with a generous line height, labels and buttons 500. **Instrument Serif**
italic is a rare accent (`.font-accent`): one phrase, never a heading system. Eyebrows are tracked
capitals: 10-12 px, weight 500, 0.15-0.2 em, uppercase, kept to labels that are truly small. All three
families are self-hosted through `next/font/local` in `app/layout.tsx` (`--font-display-face`,
`--font-text-face`, `--font-accent-face`). **Seven steps and no others in components**
(tests/design/scale.test.ts): 12 · 14 · 16 · 20 · 28 · 40 · 64. Tabular numerals in gauges and totals.
These are the literal steps a component may write; the roles carry their own sizes (`text-title` 22,
`text-heading` 32).

**Display numerals.** Calorie and stat figures are big and bold: `numeral-xl` 48 px / 700 / -0.035 em
(the lead figure of a screen: calories left), `numeral-lg` 32 px / 700 (a card's stat), `numeral-md`
24 px / 600 (a figure in a row or an inset). Use the utility with the `.numeral` class (display face,
tabular figures): `numeral text-numeral-xl kcal`. The unit beside it stays caption-size and muted
("kcal left"). A figure never stands for missing data: no reading is "-", never 0.

## Layout

One column at 390 px with 16 px gutters and a 4 px base rhythm; card gaps 12 px, section gaps 20 px.
**Every card surface has 16 px padding**; rows inside a card use 12 px.
Screens scroll; the dock floats over the bottom 92 px. Every tap target is at least 44 × 44 px.

**Scroll ownership (2026-10-04, owner: "if I'm on the inside card … once I hit the very bottom, the
whole application can start scrolling in the same direction … a user doesn't have to figure out where
their finger needs to be placed").** One scroller per screen: the page.
- Inline content never scrolls inside itself. A card, a panel joined to a card and a tray grow, and the
  page scrolls; a long inline list caps at six rows with "Show all" (KIT.md §7).
- A horizontal carousel owns the x axis only (`overflow-x: auto`, `overscroll-behavior-x: contain`,
  snap per card); a vertical gesture that starts on it scrolls the page.
- Only an overlay that locks the page behind it (a modal pop-up, the chat overlay, a picker wheel)
  scrolls inside, with `overscroll-behavior: contain`, because there is nothing behind it to hand to.
- No other element sets `overscroll-behavior`. A nested vertical scroller inside page content is a bug.
**No scrollbars** (2026-10-04, owner: "Remove the scroll side bar indicators, we don't like those"):
`app/globals.css` sets `scrollbar-width: none` and `::-webkit-scrollbar { display: none }` on html,
body and every element. Touch, wheel, trackpad and keyboard scrolling are unchanged; nothing may bring
an indicator back (`tests/design/scrollbars.test.ts`).

## Elevation & Depth

Matte, not glass. Three levels, and every surface sits on exactly one (2026-10-04, owner: "card
components throughout the application should also have the same rules … a few of them don't even have
shadows, so they look like they're almost sucking in"):

| Level | What | Recipe |
|---|---|---|
| E0 inset | wells, trays, fields, a card inside a card | no drop; an ink hairline (`.elev-0` at 6 %; a nested card at 16 %, `--hairline-card`: `Surface nested`, `CardFrame` inside a card) |
| E1 card | every card standing on the ground | `.shell` + `.surface`, `--shadow-card` (`Surface`, `CardFrame` on the ground) |
| E2 floating | pop-up sheets, the chat overlay, menus, the dock, toasts | `--shadow-float` (`.elev-2`) |

Rules: a card on the ground is never flat (E1, or it is not a card — then it is a row on another card);
never a shadow inside a shadow (children of an E1 card are E0); elevation only rises with z (a panel
joined to a card does not add a second drop); the charcoal meal card uses `--shadow-hero`, its E1.

**The contrast step (2026-10-19, UI makeover §3).** A surface on another surface differs from its
parent by at least 1.10:1 at every gradient stop and carries a hairline, so a card never blends into
the card behind it. Steps alternate: ground → card (E1, `--grad-card`, `--shadow-card`) → inset (E0,
`--grad-card-inset`, the 16 % `--hairline-card`, no shadow) → card (E0, `--grad-card` again). There is
no fourth level, and never a shadow inside a shadow. `CardFrame` (`components/ui/CardFrame.tsx`) picks
the step itself from the card it sits in (sizes sm/md/lg: 12/16/20 px padding, 16/24/32 px radius;
tones ivory, recess, olive and ink) and throws in development at a fourth level. Legacy nested `.surface`
cards take the same steps through one rule guarded by `html[data-card-step]` (`app/layout.tsx`);
removing the attribute reverts them all. The `.olive-panel` tint is 8 % so it too steps off its
card (10 % and up would drop muted text on a panel inside an eaten meal card below 4.5:1). Matte
charcoal stays for the meal card and the dock, and for the ink hero card below.
`tests/design/surface-step.test.ts` holds the ratios on all four grounds.

**Bold steps (2026-10-19).** The card is brighter (`#FEFDF9 → #F9F6EE`) and the ground a step deeper,
so a card stands at least 1.20:1 off every ground; the inset is deeper (`#E7E1D4 → #E4DED0`, 1.20:1 off
the card). `--shadow-card` is firmer (a 10 % contact shadow, a short 12 % drop and a long warm drop),
a card's edge is ink at 14 % and a nested card's 16 %.

**The ink hero card (`CardFrame tone="ink"`, 2026-10-19).** The card that leads a screen may be
matte charcoal (`--grad-matte`, the bevel) with the hero drop (`--shadow-hero`) instead of ivory. Its
face carries `.matte`, so every text role inside turns cream with no class change, and `.kcal` takes
the persimmon base. A card inside it steps *down* into the charcoal (`--grad-card-ink-inset`
`#0D0D0C → #10100F`, at least 1.10:1 off the ink at every stop, a cream hairline at 16 %); one inside
that is the ink face again. A light face never sits inside an ink card (CardFrame maps ivory and
recess to the charcoal steps), because the cream text it inherits would land on ivory; legacy nested
`.surface` cards inside one take the same charcoal steps through the guarded rule. One ink card per
screen at most: it is the hero, not a theme.

Ivory cards carry an ink hairline at 14 % and `--shadow-card` (a contact shadow, a short drop and a
long, warm drop). The meal card adds the reference's deeper drop. Olive and charcoal surfaces carry
the inset bevel (`--bevel`). Trays inside a card are beige. Sheets are ivory with a 32 px top radius
over a charcoal scrim at 45 %. The dock is matte charcoal at 94 % with a light blur.

### Techniques
- **Ground:** `.harvest-ground`, pure CSS and still: flat white (`--color-paper`), no grain, no wash.
- **Grounds (selectable):** Settings › Background offers two, White `#FFFFFF` (default) and Black
  `#000000` (`lib/design/grounds.ts`; the same values are written in `app/globals.css` as
  `html[data-ground]`). A ground moves the bare page and its text roles only: its base
  (`--color-paper`, `--color-background`) and the browser chrome colour (`themeColorFor`). On Black the
  bare-page text roles turn white and grey and the primary button turns white; light surfaces on it
  (cards, sheets, fields, notices) reset the roles to ink. Cards, the matte hero surfaces and the dock
  keep their colours. A stored choice from the four-ground era still reads (`toGroundId`: oat, sage and
  clay are White; mist is Black). The choice is kept on the phone for the account and sets
  `<html data-ground>`. Both grounds pass the contrast table (`tests/design/grounds.test.ts`).
- **Black ground, light surfaces:** the Black ground is a text-role remap on the bare page only
  (`html[data-ground="black"]`); every card role is checked on White, on Black and inside the matte.
- **Matte surface:** flat black, no grain (`.matte::before` is kept and drawn at 0 opacity).
- **Gauge:** the arc alone on an ink-6 % track, gradient arc with round caps, no glow.
- **Today calendar:** the Day card's calendar face: a seven-day strip under the day's heading, then the
  ledger, a charcoal tab with the calories left that opens to protein, carbs and fat. Double-tap the
  week to add four matching weeks in the same card.
- **Health Overview Orbit (2026-09-30, retinted 2026-10-01):** the Day card's overview face, opened
  from the face switch's eye. The orb shows in the overview only, at the ring's centre; the seven
  entities leave it, orbit slowly clockwise while each stays upright, and gather back into it on
  close. Choosing one moves it to the top of the stage with its detail beneath, and the ring and the
  orb fade. The orb is a warm ivory sphere marbled in olive, sage and wheat; the nutrient entities are
  food forms — an apple (calories), wheat (carbs), a fried egg (protein), an avocado (fat), a water
  drop — beside the flame (active burn) and the moon (recovery), each in its muted gauge hue with a
  soft contact shadow, no glow. Missing, loading or switched-off body data reads "…", "—" or "Off",
  never zero. Under reduced motion nothing turns or tweens.

## Shapes

Radii in components: 12 px tiles, 16 px wells and bubbles, 24 px cards, 32 px sheets and the meal
card, 9999 px for every button, chip, pill and gauge (tests/design/scale.test.ts). The meal photo
carries the reference's sweeping curve: 72 px on the corner that meets the text. Icons are linear,
1.5 px stroke, 16–24 px, inline SVG, currentColor; a cream icon on olive or charcoal sits in a
hairline circle. Never emoji.

## Components

### Buttons

One component, `components/ui/Button.tsx` (2026-10-04, owner: "we need a buttons system throughout the
application. Some are too fat, some are too plain, their states change … if something's landed and
saved, need a confirmation … I'd like it if the button itself did that thing, so we don't have to do
toast notifications, as long as it's classy").

| Variant | Job | Look |
|---|---|---|
| `primary` | the one action that completes a flow (Save, Log it, Send); at most one per view | olive fill, cream label, the inset bevel |
| `secondary` | the action on a card (Plan, Add a food, Connect) | a 3.5 % ink tint, an ink hairline at 20 %, a hairline drop; cream-tinted inside a matte card (`.btn-ink` is its legacy class) |
| `tertiary` | the quieter neighbour of a secondary (Cancel, Log what you ate) | the beige well (`button.well` legacy) |
| `ghost` | an inline word inside a row (Undo, Edit, Show all) | text only, weight 600, a wash under the finger |
| `danger` | a destructive action | red ink on a faint red wash; the confirm step (`data-armed`) fills red |

- **Sizes are fixed:** `sm` 36 px to see with a 44 px hit area, `md` 44 px (the default), `lg` 52 px
  (sheet and panel primaries only). Padding 12 / 16 / 20 px; labels 14 px weight 500 (16 px at `lg`),
  sentence case, the verb first ("Add a food"), and **never wrapped**. `shape="circle"` holds one glyph
  at the size's height; `block` fills its row. A glyph leads at 16–20 px.
- **States:** rest; hover (pointer devices only, a step darker); pressed (3 % smaller at once, the snappy
  release, global); focus-visible (the olive ring); disabled (40 %, it keeps its size); and the outcome
  states below. Selection is a chip, not a button state.
- **Outcome, inside the button.** `pending`: the label gives way to three pulsing dots and the button
  holds its width. `success`: a tick draws in and the verb takes the label's place ("Saved", "Logged",
  "Updated", "Swapped") for 1.6 s, with a short double haptic where the device has one; the light
  variants tint sage, the olive primary keeps its fill and a soft sheen crosses it once. `error`: one
  3 px shake, red ink, and `errorLabel` ("Try again") for 2.4 s; the reason goes in a `Notice`.
  Label, dots, confirmation and error share one grid cell, so the button is as wide as the widest of
  them and never jumps. Drive it with `useButtonStatus` (a local write) or `useActionFeedback`
  (`controlProps` carry `data-feedback-state`, which the button reads).
- **No success toasts.** A write confirms in the control that started it. A toast remains only for an
  Undo that has no home on screen, or a write whose control has gone (`confirm: "notice"`).
- **Chip:** a choice in a small set, not a button: off is muted ink on the beige track; on is olive
  with cream text (`components/ui/Chip`).
- Never: a `pill-in` track used as a button, an inline height, a button class string outside
  `components/ui`, or two primaries side by side.

### Text fields

Three tiers, one family (2026-10-04, owner: "if they're just for an item lookup … that could be one
state; the next should be the AI variation; the final the master AI integration at the bottom floating
menu … the first two shouldn't be too far off from each other … so the user picks up: this is a normal
search, this is AI").

| Tier | Where | Look | Behaviour |
|---|---|---|---|
| 1 Lookup (`components/ui/SearchField`) | Foods search, the meal tray's food search, conversation search | paper, ink hairline 14 %, inner shadow, the magnifier, a clear × | filters as you type; never a send, never the AI |
| 2 Component AI (`components/plan/PlanComposer`) | a meal card's ask box, the recipe hub's | the same paper with a thin olive→sage→wheat AI rim (no spark logo; the rim alone marks it as AI), "+" attach, the olive send | acts on that component only (§Motion, AI scope) |
| 3 Master AI (`components/dock/AssistantField`) | the dock | charcoal with the AI rim, cream text, no spark logo | page-aware; opens the chat overlay |

- **Field (`input.well`, `.field`, or a `.well` wrapping its input — one look since 2026-10-04):** paper
  fill, 16 px radius, ink hairline at 14 %, faint inner shadow. Text ≥ 16 px on every typing field.
- **Focused:** quiet, as on iOS. The olive caret marks the field; the hairline warms to olive at 42 %
  and the fill lifts a shade. No outline, ring or halo: text fields opt out of the global
  `:focus-visible` ring (app/globals.css).

### Cards and Surfaces
- **Card (`components/ui/Surface`):** ivory, 24 px radius, ink hairline 14 %, E1 `--shadow-card`; 16 px
  padding, rows 12 px. Inside another card it is `nested` (E0). **Panel:** the section hue at 7 %, on a
  card only — a panel standing on the ground gets a shell.
- **AI label (`components/ui/AiLabel`, 2026-10-05):** a neutral `Tag` reading "AI" (a model wrote it)
  or "AI ranked" (Jev ranked a suggestion card), from the payload's `provenance`; app-written items,
  other Jev uses (an intent fast path's templated reply or chart) and legacy rows carry none. Once per
  item: at the foot of an assistant bubble, in a meal card's tag row, beside the heading of a capture
  review or a plan photo or document read, after a Plan or hub reply. No spark glyph; it sits in flow
  and arrives with its item.
- **Dock (morphing):** two matte charcoal bodies, 64 px tall, grained, with the bevel. Inactive
  destinations are cream line icons at 60 %; the active one sits in the olive lens with its label.
  The bubble (a speech-bubble glyph at rest) opens into the ask field, input tier 3: charcoal, a thin
  olive-to-wheat rim, 16 px cream text. No ask field carries the spark logo (owner, 2026-10-04). Behaviour (springs, lens travel, attach
  tray, keyboard handling) is unchanged from Motion. 2026-10-04 (U18–U22):
  - **Attach tray:** Camera, Upload, Weigh in, Chat; there is no Scan tile (owner: "If we have the
    camera button, you should just have the camera button"). A photo is read once for a barcode
    (`lib/barcode/still.ts`, the live scanner's zxing worker on one frame, check digit as the guard);
    a known product goes in as a barcode, several products ask "Which one?", anything else goes to
    the AI as a plate, menu or label, where "This was a nutrition label" still re-reads it.
  - **Chat overlay (`components/dock/ChatOverlay.tsx`):** on a dock page the ask, a photo and Chat open
    the account's current chat over the page instead of routing to /coach: an ivory E2 card (32 px
    corners, 16 px gutters) rising from the dock on smooth over a charcoal scrim at 45 % with a blur.
    The page keeps its scroll and state, inert under the card (`overflow: hidden` on body, never
    `position: fixed`); the dock stays the composer. Escape, the scrim, the close button and Back
    close it; "Open full chat" replaces its history entry with /coach. Each turn carries the page's
    scope (`components/dock/chat-scope.ts`: `{ kind: "page", page, date? }`, global on /coach).
  - **Weigh-in (`components/coach/attachments/WeighInField.tsx`):** an ivory E2 card over the whole
    dock row, `.matte-reset` so it is ink on paper, the number in the paper field in the account's
    unit. Log writes through the coach's weight path (no chat turn), confirms in the button
    ("Logged", tick, haptic), then the card swaps on the gentle spring with the blur into the
    follow-ups: Undo for 8 s (a draining hairline; the real undo), "Your trend" and "Suggestions",
    which open the chat overlay with a short ask. Closing keeps a typed number.
- **Chat header (`components/coach/CoachHeader.tsx`, U21):** the living mark (`SashaMark`: Thinking's
  three orbs in their goo on an ivory 44 px disc, drifting at a third of Thinking's pace, three times
  faster while a turn runs; still under reduced motion), the name (40 px on /coach, 20 px in the
  overlay) and the scope under it, plain metadata (a sage dot and "On Today" / "Whole app", never a
  pill, so it does not read as a control); while a turn runs only the mark and the dot quicken — no
  words join the header, because the transcript's own thinking line is the one place that says it. /coach puts Conversations, a secondary button with the chat count, at its end.
- **Conversations (`components/coach/ConversationPicker.tsx`, U20):** "New chat" (primary) on top;
  at the 8-chat limit it reads "New chat · make room first" (secondary), never starts a chat, and moves
  focus to the list with a notice that says how to make room. A lookup field filters
  titles at once and, from 3 characters, searches message text on the server, showing the matching
  line under its chat with the words in bold. Flat rows, grouped Today / This week / Earlier / No
  messages yet: title on one line, a relative time, the current chat washed in the section hue.
  Swipe left uncovers Delete; the row's "…" opens Rename, Clear messages and Delete in a row under
  it. Delete and Clear ask twice inside the button ("Delete" → "Delete for good"); there is no undo,
  because the server keeps no deleted chat.
- **Meal card (Porcelain, 2026-11-17):** white card, 32 px radius, an 8 % ink hairline and the soft card shadow, no `.matte` scope; the tray is the light inset. (Harvest, 2026-10-01: matte charcoal with the deep drop.)
  - Meal cards v3 (2026-10-08, `docs/design/meal-cards-v2.md`): the slot chip leads with a word —
    `Next · 12:30 PM`, `Now · …` on the focus card (a cream chip), `Eaten · …` once ticked off
    (charcoal with a cream rim), else the slot's own name (`Meal 3 · …`), never a bare number. No macro
    bar on any card. The card's foot is a thin strip (44 px) of three equal icon zones — eaten | swap |
    details — told apart by tone (olive wash, the tray, ink 4 %) with hairlines between; eaten is an open
    ring, then a solid olive zone with a filled tick (a tap undoes it). The calorie figure is a figure,
    not a control. Eaten keeps full colour and contrast. A heart on the photo (outline / filled) saves the
    plate as a favorite meal when the page supplies one. A generator's plan miss sits in the tray as a
    "needs a look" Notice.
  - Featured (the focus card, closed): the photo fills the top 132 px in true colour, its lower-right
    corner swept on a 72 px curve, the chip on it. Below, on charcoal: the cream Fraunces title (24 px)
    and the persimmon calorie figure (`numeral text-numeral-md`), the olive spec panel — Protein, Carbs, Fat as tracked labels over
    cream values, split by hairlines — and the beige tray with its strip.
  - Compact (every other card, any open card, and every card with a flow open): the photo fills the
    card's left 34 %, its upper-right corner swept, and runs under the tray's curved corner; the chip,
    the title (17 px, two lines), the calories and the protein (`36 g protein`, a plum dot) sit beside
    it. Open, the header stays compact and the figure line shows P · C · F inline, so the ingredients
    lead: the ivory panel (ingredients, food search, preparation with an "Ask the assistant how to make
    it" button, daily share), then a row with Ask Assistant and Ate something else (pills sized to their
    words), then the strip. A focus card grows back to its featured form once the tray has folded.
  - Flows (2026-10-04, owner: "one card with what's currently selected at the top"): Plan with
    Assistant, Log what you ate and Swap open inside the card, never as a second card under it. The
    card takes its compact form, so the meal the flow acts on stays on top, and the flow takes the
    detail's place in the beige tray (`components/MealCardTray.tsx`, `Sheet` presentation `inset`): a
    slim mode row (glyph, the flow's name, close), no repeated title, time or macros, no chrome,
    margin or inner scroller of its own. Detail and flow swap in place: the tray's height springs
    (gentle) while one face blurs out and the next blurs in; closing runs back the same way and hands
    focus to the footer. Every number in a flow is a suggestion's own or is said as room left ("About
    111 kcal and 28 g protein left for this meal", said of the new ideas). Swap is a carousel of
    `SuggestionCard`s (photo, name, portions, kcal over P · C · F, source tag); a tap grows the card in
    place (below) to its foods and "Swap to this", which confirms in the button ("Swapped"). A log from
    a flow is checked in the capture editor before it files, and its button confirms "Logged".
  - Suggestion carousels (`components/recipes-hub/SuggestionCarousel.tsx`, 2026-10-04, owner: "it
    should grow smoothly and take up the space provided … and then it should shrink back into the
    horizontal scroll"): one card system for the Foods recipe hub, Swap and a menu's picks. A row owns
    only x and snaps card by card. A tap is a container transform: the card grows on the gentle
    spring to the row's full width, its parts gliding at their own size (text never stretches), the
    photo becoming a hero, while the row scrolls to sit it flush and the others fade aside; a close ×
    sits by the name, its detail fades in once it has room, and a card whose actions would sit under
    the dock comes up the screen. × or Escape closes it: detail out first, then the card shrinks back
    and the row returns to where it was; focus goes in on open and back on close. A card shows a photo
    only when it pictures that kind of dish, otherwise the olive art.
  - Unknown dishes show the app-owned olive art (an olive wash with the grain), never a stranger's
    photo. Stock photos are never presented as the account's exact meal and never used as nutrient
    evidence (`lib/today/meal-art.ts`, `docs/design/meal-card-image-sources.md`).
- **Snack ticket:** an ivory ticket with a small olive art tile.
- **Day card (2026-10-01, reshaped 2026-10-19, `components/today/DayCard.tsx`):** one card at the top of
  Today, 32 px radius (concentric with the phone's corners 16 px away). The viewed date is the page's
  own title (`PageTitle`), not the card's. Header, row 1: the Rest/Training pill and the cup
  (`components/today/CupSlot.tsx`), on both faces; row 2: the full-width face switch, a recessed 44 px
  pill with two labelled segments (Calendar, Overview); the chosen one opens into the olive lens with
  its name. No swipe between faces: the week strip owns horizontal gestures. There is no Board.
  - Calendar: the week strip with the olive lens and the month on double-tap (weekday initials once, a
    new month named above its first day), over the day's live widget; without a target revision a
    "Finish your profile" prompt, nothing invented.
  - Overview (the daily cockpit, `components/today/overview/*`): one screen, no scrolling, at most six
    small blocks — summary (calories left in `numeral text-numeral-xl`, the macros), meals (done of
    planned, the next one), the rebalance line, one next step, the companion row and the week's trends
    row. Each block is a small `CardFrame`, which inside the Day card takes the inset step, so no block
    blends into the card behind it. Copy never scolds.
  - Cup (`CupSlot`): one 44 px control in the card header. A tap adds one step in the account's unit
    (8 oz, a cup or 237 ml); holding ~350 ms opens a bar above it that counts faster the farther right
    the finger slides ("+48 oz → 96 / 128 oz") and logs once on release. It is the only water control
    on Today. Under reduced motion nothing animates.

### Sheets, the ask box, and what a photo or document turns into

- **Sheet (2026-10-03, `components/Sheet.tsx`):** a modal pop-up anchored beside the control that
  opened it (`lib/dom/popover-place.ts`), not a bottom drawer — see §Motion for the placement and
  dismissal rule. `AttachedSheetHost` renders every `Sheet` under it as a panel joined to the
  bottom of its opening card instead (the recipe hub's manual editor); it grows and never scrolls
  inside. `InsetSheetHost` renders it inside the card itself (Today's meal-card flows, §Cards and
  Surfaces › Meal card): the mode row from the sheet's `inset` (a name and a glyph), never its
  `header`, and no chrome of its own.
- **Input tiers (2026-10-04):** tier 1, lookup (`components/ui/SearchField.tsx`): paper, the
  magnifier, clear, no send. Tier 2, a component's AI ask box (`PlanComposer`): the same paper with
  the AI's thin olive → sage → wheat rim (`--grad-coach-composer-rim`), no spark logo, and
  the olive Send circle. Tier 3, the dock's charcoal ask bar (`components/dock/AskShell.tsx`):
  charcoal, the same rim, cream text.
- **PlanComposer (`components/plan/PlanComposer.tsx`, `components/plan/composer/*`):** the Plan
  panel's ask box (tier 2), drawn as one SVG piece so the rim runs round the tab too. "+" grows a
  tab 30 px out of the pill's own top edge, one continuous piece of the same material, holding the
  attach and camera actions as bare 22 px glyphs (no backing; owner: "just the icon"), each centred
  in its own half of the tab with a 44 px hit area; "+" turns into "×" while the tab is open,
  and a chosen file, a second tap, Escape, or a tap outside puts it away on the same spring in
  reverse. `cameraFirst` (log mode) puts a full-width camera button above the box instead, so there
  is one way to the camera, not two a thumb's width apart; `onDocument` swaps the attach target from
  a photo to a meal plan, recipe or menu file.
- **PhotoResult / DocumentPlan (`components/plan/PhotoResult.tsx`,
  `components/plan/DocumentPlan.tsx`):** what the panel shows after a photo or an uploaded file. A
  plate offers a ½× / 1× / 1½× portion adjuster and "Check and log"; a menu shows up to three dishes
  as `SuggestionCard`s in the shared carousel (photo, name, the ordering tip, kcal over P · C · F,
  "Ask first" when the rules need a word with the server), each growing in place into a larger card
  with the photo as a hero and "Log it". Every log is checked first (`components/plan/PanelReview.tsx`:
  the capture's own foods in the capture editor; nothing files before its "Log it"). A matched meal
  plan previews its days and the one meal
  matched to this slot — the foods it will place and the ones left out, never guessed — behind one
  "Use for this meal", which writes nothing until tapped. A `SwitchLine` under either lets the same
  photo be read another way without a second upload. Both are static-props, no-I/O components.
- **The Plan / Log panel header (`components/plan/PlanSheetHeader.tsx`, 2026-10-04, owner: "some
  personality at the top, some colour, and hierarchical text"):** three steps — a tracked overline in
  the section hue ("PLAN · MEAL 1"), a 28 px Fraunces title naming the meal from the slot's clock
  time (`lib/coach/meal-type.ts`: Breakfast, Lunch, Snack, Dinner, Late meal) with the time beside it
  in muted 14 px, and the slot target as chips (calories `.kcal`, protein plum, carbs sage, fat
  Dijon via `.macro-ink-*`). A soft wash band (12 % fading out) and a round glyph tile carry the meal
  type's tint: breakfast wheat, lunch sage, dinner olive, snack plum (`.plan-head[data-meal]`). The
  same header heads log mode ("LOG · MEAL 1"). `Sheet`'s optional `header` slot holds it; the
  dialog keeps its plain name ("Plan Meal 1 · 8:00 am"). It heads the modal panel only: inside a meal
  card the card above names the meal, so the flow shows its mode row and the slot's room left instead.
- **Notice (`components/ui/Notice.tsx`, 2026-10-04, owner: "Messages, failed processes and alerts
  should have their own toast box that fits the UI"):** the one inline message card — a wash card
  with 16 px corners, a 24 px round tone mark, a title and/or a body line, an optional action
  ("Try again") and an optional dismiss; it grows in on the smooth spring. Tones: info (sage wash),
  attention (Dijon wash), error (red wash, `role="alert"`), success (sage wash, filled tick), neutral
  (beige). Everything else is `role="status"`. Text is ink, so a Notice reads the same inside a
  matte card. Use it for every failed process, empty answer and alert line; a plain sentence of the
  coach's own words stays a paragraph. Floating confirmations stay `Toast` / `ActionFeedbackToast`.

### Meal card actions and the ingredient stepper

- **MealCardActions (`components/MealCardActions.tsx`, `lib/today/swipe-detents.ts`):** Clear and
  Delete moved off the meal card's face and behind a sticky left swipe. The tray fills exactly the
  room the card leaves as it slides — Clear first, a faint see-through olive deepening to full
  colour as it opens, then Delete the same way in red, each a rounded pill standing on the page
  background, never a square block behind the card's corner. Each stage catches (a sticky detent)
  before the next; past Delete's catch, a release deletes. Every label fits its pill at every width:
  each pill is a size container that shows the longest label it holds ("Release to delete",
  "Release", then the glyph; "Delete", then the glyph; "Clear"), crossfading in place, never clipped.
  Keyboard and screen-reader users reach the same two actions through a More control that only takes
  the visual surface on focus.
- **The ingredient stepper (inside `components/SlotCardDetail.tsx`):** a 28 px glyph button with a
  44 px hit area on each side of an ingredient's amount, sized so the row stays on one line. A line
  in grams steps by its food's own portion when one is known ("1 tbsp", 14 g), snapping to whole
  portions and never below one, and reads "2 tbsp · 28 g"; otherwise it steps 25 g. A cup steps by
  ¼ and a count food by 1 (`lib/plan/ingredient-step.ts`; the portion comes from what the session
  added the food with, or the bundled food of that name — a slot line cannot carry one through sync).

### Food search and the recipe hub

- **CatalogSearch (`components/CatalogSearch.tsx`):** the lookup field (`SearchField`, input tier 1)
  over slim list rows in a soft off-white tray with a hairline (E0: the tray is always inside a sheet
  or a card), each with an add glyph and a small source tag on the second line — USDA in sage, the
  account's own foods in olive, Open Food Facts neutral, text only (never the USDA mark). A row whose
  source calories and macros disagree by more than 10 % carries a small warning glyph.
- **Serving-aware rows (2026-10-04, owner: "nobody's going to eat a hundred grams of cayenne pepper
  or beef tallow"):** a food row states one serving, not 100 g — "1 tbsp (14 g) · 126 kcal", the
  weight added only when the portion's own label lacks it; with no real portion "100 g · 900 kcal";
  with no serving data at all, the row's older text. Portion pills read "1 tbsp · 14 g · 126 kcal".
  `lib/catalog/serving.ts` is the only reader of the serving fields, all optional; the bundled foods
  and the account's own foods state their serving the same way offline. Used by CatalogSearch, the
  Add a food sheet and the log sheet.
- **The recipe hub (`components/recipes-hub/*`):** `RecipeHub` is what Foods' "New recipe" button
  opens, in place below the Recipes header (U15, 2026-10-04: no shared-element morph out of the
  button). The button stays where it is, says it is open (`aria-expanded`, the selected wash and a
  turned chevron) and closes the hub again; the hub's frame grows on the gentle spring with its
  cards fading in once it has room, keeps growing on that spring as its catalog loads, and folds
  away in reverse. Inside: quick chips, `RecipeCarousel` (ivory cards with a hairline and a soft drop,
  each showing one serving's `.kcal` figure, protein in plum, and a sage "Fits today" or Dijon
  "~N kcal over" tag), and a `PlanComposer` ask box. A tap grows the card in place (the suggestion
  carousel, §Cards and Surfaces › Meal card) into the redesigned `RecipeDetails` (at-a-glance chips,
  a per-serving macro strip in the four gauge colours, an ingredient checklist whose ticks hold for
  the session, numbered method steps, a muted provenance footer);
  `PutInMeal` grows a day-and-slot picker the same way, so placing a recipe never leaves the card.
  `HubAnswer` renders the ask box's results, including a `PhotoResult` for a plate or menu photo.

## Do's and Don'ts

### Do
- Do keep charcoal for the meal card, the dock and at most one ink hero card a screen; everything
  else is ivory on oat.
- Do give a screen's lead figure a display numeral (`numeral text-numeral-xl`).
- Do keep the 4 px rhythm and the 44 px minimum target.
- Do let food photos look like food: true colour, no veil.
- Do write copy in the coach's voice: short, plain, no exclamation marks.

### Don't
- Don't bring back glow, neon gradients, black grounds, chrome video or liquid glass.
- Don't add a second action colour; olive is the only one.
- Don't use a gauge hue for small text (calorie figures, `.kcal`, are the one exception: §Colors);
  macro figures use `.macro-ink-*`.
- Don't put cream text on anything light: no `text-on-olive` in components, no `text-on-primary`
  without the olive fill under it (§Contrast).
- Don't show a failure, an empty answer or an alert as a bare line of text: use `Notice`.
- Don't use emoji as icons or left-border accent stripes.
- Don't hard-code a colour in a component: add or reuse a token.

## Motion

**Liquid (2026-10-01).** Nothing changes state by appearing: every element that can take another form
grows, slides or morphs into it, and one element keeps its identity while it moves (a shared-element
or container transform, SwiftUI's `matchedGeometryEffect`). Four springs carry everything, set by how
long they look and how much they overshoot (`lib/design/motion.ts`, CSS twins `--ease-spring-*` with
`--dur-spring-*` in `app/globals.css`):

| Spring | Visual duration | Bounce | Used for |
|---|---|---|---|
| smooth | 0.45 s | 0 | containers growing or shrinking, faces, trays, sheets, page entrance |
| snappy | 0.30 s | 0.15 | lenses, segments, chips, the release of a press |
| bouncy | 0.50 s | 0.28 | things with weight: the orb, entities leaving it, the water count |
| gentle | 0.55 s | 0.08 | large shape changes: a meal card opening, an explainer filling the board |

- **Press:** a control settles 3 % smaller at once while held (90 ms) and springs back on snappy when
  let go. Disabled controls do not move.
- **Day card:** its height always springs (smooth) from the face it had to the one it has; later growth
  inside a face (the month) flows with it. Switching faces, content blurs out of focus and the next
  comes into it, never a cut. The face switch is the dock's lens: one olive capsule on two springs,
  leading edge quick, trailing edge slow, so it stretches in flight; glyphs under it turn cream.
  Opening the overview, the orb comes in at the ring's centre (bouncy, from under half its
  size) and the entities leave it after the gather; figures fade up once an entity is in
  flight. Closing, figures go first, the entities gather into the orb, the orb steps back unseen,
  then the card folds and the week and the ledger come back; focus returns to the face switch.
- **Week and month:** the selected day is an olive lens fixed at the strip's centre, like an iOS
  picker; the days slide under it. The month grows out of the week on smooth and folds back; in the
  month the lens glides between picked days (snappy).
- **Meal card:** opening is a container transform (gentle). The photo grows from the left thumbnail
  into the top hero, always covering its box at its own aspect so it only ever scales evenly; its
  sweeping corner animates with it; title, calories and time glide to their new places; the macro
  panel, the tray and its actions grow open with their content in place, so the card's edge reveals
  them and, closing, covers them. Every size change inside the card springs in its own box, so the
  card's height only follows and the cards below slide rather than jump.
- **Sheets (retired 2026-10-03: no more bottom sheet, no drag handle):** a `Sheet` is an anchored
  pop-up card, not a drawer. It scales in from, and back into, the centre of the control that opened
  it (`lib/dom/popover-place.ts`), landing below the trigger when it fits there, above it when it
  fits there instead, or on the roomier side, clamped into the usable area; with no trigger (or none
  still connected) it scales in centred on the screen. A tap outside, Escape, or its own Close button
  dismisses it on the same spring reversed; there is nothing left to pull or flick. `AttachedSheetHost`
  is the one exception: inside it, a `Sheet` grows out of the lower edge of the card that opened it, as
  a panel joined to that card (no scrim, no modal pop-up) — Today's meal-card flows and the recipe
  hub's "Build my own" editor both use it.
- **Expanding rows** (`components/ui/Disclosure`, a button header, not `<details>`): the height
  springs open on smooth, the content fades and lifts in after it; closing reverses (content first,
  then height); the chevron turns on the same spring. Reduced motion is instant.
- **Segments:** one olive lens slides to the chosen segment (snappy).
- **Screens:** a screen opened from the dock rises 12 px and fades up on smooth while the dock stays
  still. Changing the viewed day never replays it.
- **Notices** rise out of the dock's edge on bouncy.
- **Thinking** (2026-10-03, owner: "a really cool animation any time the AI is thinking … so it's not
  frozen"): `components/ui/Thinking.tsx`. Three orbs — olive, sage, wheat — orbit at three speeds and
  breathe toward the centre inside an SVG goo filter, so they melt together and part; a slow shimmer
  crosses the label. After 6 s a second line reads "Still working — this one takes a moment" (compact:
  it takes the label's place). `inline` (24 px orbs, 14 px label) in sheets and panels, `compact`
  (16 px, 12 px) in a chat bubble, status chip or the dock field. `role="status"`, polite. Reduced
  motion: one calm pulsing sage dot and still words. Every AI wait uses it (meal ideas, reading a photo,
  file or recipe link, the coach's reply, applying an action); a save stays plain words. While the
  coach replies, it shows in the transcript's bubble (the one that
  announces it) and the chat header's mark, whose orbs speed up to Thinking's pace with no words
  (U21, 2026-10-04: one indicator in words, never three). The dock field shows no thinking text.
- Gauge arcs draw over 1.2 s on first paint and the numeral counts up. Coach bubbles rise 8 px over
  350 ms. The overview's entities turn once every 120 s; a chosen entity flies to the top on a spring
  and its detail rises 16 px over 350 ms. The long-press time wave follows the finger in 15-minute
  steps. The ground clip loops.
- **Reduced motion:** every spring becomes an instant arrival: faces swap, sheets appear, rows open,
  numbers change, the orbit stays still and the ground is the still poster.

### Fluid interface rules (2026-10-04)

The owner asked for "global rules for design and specifically defining our fluid UI and fluid
interfaces … shape morphing and container transforming … visual states, interactions, speed,
expansion and collapse … spring-based physics … micro-interactions". These hold for every new or
changed motion; a review cites the rule a motion follows.

1. **Identity.** A thing that changes form stays one element. A flow started on a card happens inside
   that card (the meal card's tray becomes the flow); it never spawns a second card below or a pop-up
   beside it. A button that confirms does it in itself.
2. **Source and direction.** Content grows out of the edge or control it came from and returns into it.
   Closing is opening run backwards on the same spring.
3. **Order.** Opening: the frame moves first, the content fades in once there is room (`MORPH.contentIn`,
   ~150 ms in). Closing: the content leaves first, then the frame folds. Content swapping in place
   crosses with a 6 px blur (`SWAP`), never a cut.
4. **Speed by size.** Micro (a press, a toggle, a tick): 90 ms in, snappy out. A control (a chip, a lens,
   a button's state): snappy, 0.30 s. A container (a card, a tray, a panel): gentle, 0.55 s, or smooth
   when nothing should overshoot. A page-level layer (the chat overlay): smooth, with a 200 ms scrim.
   Nothing longer than 0.6 s except the Day card's choreography.
5. **Interruptible.** Every motion is a spring that retargets mid-flight. A second tap reverses from
   where it is; nothing queues or waits for an animation to finish.
6. **Follow the finger.** A drag tracks 1 : 1, resists past its limit (rubber band), and its release
   carries the gesture's velocity into the spring. Every gesture has a visible tap equivalent.
7. **Morph limits.** Text never stretches: it glides to its new place (`layout="position"`). Photos only
   scale evenly (cover). A shape that more than doubles crosses its content with `SWAP` rather than
   scaling it.
8. **Height.** A container's height always springs (`AutoHeight`, `Fold`, `Disclosure`); the content below
   slides, it never jumps. Only height moves, so corners stay crisp.
9. **Lists.** Items entering stagger 30–40 ms, at most six; items leaving fold their height while fading.
10. **Feedback timing.** Press response ≤ 90 ms. A save confirms in its button for 1.6 s. An undo lives
    5–8 s in place. A waiting AI shows `Thinking` at once; a plain save shows dots.
11. **Reduced motion.** Every spring is an instant arrival; a swap is a 150 ms fade at most; loops stop.

**AI scope (2026-10-04).** Every AI input is bound to one scope and says so. *Component*: a card's ask
box (tier 2) acts on that card only and answers inside it. *Page*: the dock's ask bar (tier 3) knows the
screen it was opened on (Today's meals, Body, Foods, Settings), opens the chat overlay over a dimmed page
— no route change, the page keeps its place — and every turn carries `scope: { kind: "page", page }`.
*Global*: the full chat at /coach.

### Action feedback

Every enabled control keeps the 150 ms press response. A selected control stays highlighted until the
selection changes; selection is not presented as a completed mutation. Async controls use one outcome
language:

| State | On a `Button` | On any other control | Tactile | Lifetime |
|---|---|---|---|---|
| Pending | three dots in place of the label, width held | a Dijon hairline | none | until it settles |
| Awaiting a user decision | — | a Dijon boundary on the proposal card | none | until accepted or dismissed |
| Commit or send succeeded | the tick and its verb; light variants tint sage | a sage ring that blooms and fades | a short double tap where supported | 1.6 s |
| Content changed | the tick and "Updated" | an olive hairline | none | 4 s |
| Failed | one shake, red ink, "Try again" | returns flat | none | 2.4 s on the control; the `Notice` / alert toast stays until dismissed |
| Reversible change | the tick and its verb | the sage ring | as above | the Undo toast (or an in-place Undo) for 5 s |

`components/ui/ActionFeedback.tsx` owns the reusable contract. `useActionFeedback().run` wraps the
operation and returns `controlProps` for its initiating button plus `notice` and `dismiss` for
`ActionFeedbackToast`. Since 2026-10-04 a success confirms in the control and shows no toast unless the
write offers an Undo or passes `confirm: "notice"`. Use `kind: "commit"` for sends and durable confirmations; use `kind: "change"`
for an edited card, meal, allergy, preference or similar temporary change marker. One hook instance
owns one logical action; do not spread it across unrelated controls. A screen that owns several
writes of one kind (Today's slots) passes a stable `key` per control and reads `phaseFor(key)`, so
only the control that started a write lights, and `queue: true` so a second write waits instead of
joining the first. `notify` confirms a write a closed sheet already committed (no second haptic) or
shows a blocker, which stays until dismissed. Unsupported haptics are an expected visual-only
fallback. Failure never plays the success vibration or success glow.

**Motion Level:** expressive (springs, shared-element and container transforms)
**Durations:** 90ms press, 150ms, 300ms snappy, 450ms smooth, 500ms bouncy, 550ms gentle (CSS twins settle in 420 / 520 / 650 / 600 ms), 1.6s confirm, 1200ms
**Easings:** spring smooth / snappy / bouncy / gentle (linear() in CSS), cubic-bezier(0.16, 1, 0.3, 1)
**Hover Patterns:** transform, color
