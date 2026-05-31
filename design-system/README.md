# Cashflow — colour & core token system (v1)

A deliberately small system: **three families**, each expressed as a
**base · ink · soft** triad, with fixed roles. Drop `tokens.css` into your
theme layer (or read `tokens.json` with Style Dictionary / Tailwind / your token
pipeline) and reference the custom properties — don't hardcode hex.

```html
<link rel="stylesheet" href="tokens.css">
<!-- swap accent / neutral at the root: -->
<html data-accent="indigo" data-neutral="warm">
```

---

## The three families

### 1 · Neutral (foundation)
Surfaces + a four-step ink ramp + two hairlines. **No saturation** — neutrals
recede so the accent can speak. Two temperatures: `warm` (default) and `cool`.

| token | role |
|---|---|
| `--cf-bg` | page |
| `--cf-surface` | raised card / sheet / modal |
| `--cf-surface-2` | inset region · column header |
| `--cf-ink` | primary text · **values** · headings |
| `--cf-ink-2` | secondary text |
| `--cf-ink-3` | mono micro-labels |
| `--cf-ink-4` | placeholder · disabled |
| `--cf-line` | hairline divider |
| `--cf-line-2` | stronger divider · control borders |

### 2 · Accent (the one "live" colour)
The single colour that means **active / now / focus** — scrub line, playhead,
active row, primary action. **Swappable** via `data-accent`; default `indigo`.
Families: `indigo` · `teal` · `violet` · `clay` · `bronze` · `slate`. All share
a fixed perceptual weight so swapping never breaks contrast.

| token | role |
|---|---|
| `--cf-accent` | the saturated mark — playhead, scrub line, primary button fill |
| `--cf-accent-ink` | accent-coloured **text** on light surfaces |
| `--cf-accent-soft` | the pale wash behind a base mark (active row, active chip) |
| `--cf-accent-on` | text colour to use **on** the base fill (auto-darkens for `bronze`) |

### 3 · Semantic (money in / out)
**Fixed** across every accent choice. Green = in, red = out, nudged toward
neutral so they read as *data*, not *alarms*.

| token | role |
|---|---|
| `--cf-in` / `--cf-in-ink` / `--cf-in-soft` | deposits · positive deltas |
| `--cf-out` / `--cf-out-ink` / `--cf-out-soft` | payments · negative deltas |

---

## Usage rules

1. **One accent, one job.** The accent is the single "live / now / focus"
   colour. It is *never* decorative. If two things are accent-coloured on a
   screen, one of them is wrong.
2. **The ink ramp does the structure.** `ink → values & headings`,
   `ink-2 → secondary`, `ink-3 → mono micro-labels`, `ink-4 → placeholder /
   disabled`. Borders use `line` / `line-2`, never `ink`.
3. **`base` never floats on `soft`.** When an accent **base** mark sits on an
   accent **soft** fill (e.g. the balance tooltip on the active ledger row),
   break them with a surface-coloured **halo ring + lift shadow** so the mark
   reads as elevated:
   ```css
   .tooltip {
     background: var(--cf-accent);
     color: var(--cf-accent-on);
     box-shadow: var(--cf-ring-halo), var(--cf-shadow-lift);
   }
   ```
4. **Semantic = money only.** Green/red mean cash in/out (on `↑`/`↓` glyphs and
   the number itself — never as filled bars). Don't borrow them for selection,
   hover, or status — that's the accent's and ink ramp's job.
5. **`soft` is a wash, not a fill.** Accent-soft and semantic-soft mark a region
   as selected/relevant at low emphasis. Solid `base` is reserved for the one
   element that must be unmissable.

---

## Type, radius, motion

- **Type:** Geist (UI) + Geist Mono (all numbers, dates, micro-labels). Hero
  display Geist Mono 56px / −0.025em; display-sm 28px; h1 18–22px/500; h2
  14.5px/500; body 13.5px; micro 10px/500/0.09em/uppercase/ink-3. All numerics
  `tabular-nums` (`font-feature-settings: "tnum"`).
- **Radius:** card/modal `14px` (`--cf-radius-card`); buttons & fields `8–10px`
  (`--cf-radius-control`); chips/tags `999px` (`--cf-radius-pill`).
- **Elevation:** lines do the work — flat surfaces, `1px solid` hairlines.
  Shadows only on modals (`--cf-shadow-modal`), the lock panel, and floating
  marks that need the halo treatment (`--cf-shadow-lift`).
- **Motion:** quiet. 120–150ms hover transitions; scrub is instant; the lock
  reveal is the one expressive (~0.55s) animation.

---

## What changed from the legacy palette

The previous system used a single **amber** (`oklch(0.74 0.12 75)`) as the
scrub/now colour on warm-cream neutrals. v1 generalises that one accent slot
into a **swappable accent family** (default **indigo**), cools and refines the
neutrals (less yellow), and slightly desaturates the in/out pair. Token names
moved from `--m-amber*` / `--m-*` to role-based `--cf-*`. Migration map:

| legacy | v1 |
|---|---|
| `--m-bg` / `--m-card` / `--m-card-2` | `--cf-bg` / `--cf-surface` / `--cf-surface-2` |
| `--m-ink` … `--m-ink-4` | `--cf-ink` … `--cf-ink-4` |
| `--m-line` / `--m-line-2` | `--cf-line` / `--cf-line-2` |
| `--m-amber` / `-ink` / `-soft` | `--cf-accent` / `-ink` / `-soft` (+ `--cf-accent-on`) |
| `--m-in` / `-ink` / `-soft` | `--cf-in` / `-ink` / `-soft` |
| `--m-out` / `-ink` / `-soft` | `--cf-out` / `-ink` / `-soft` |
