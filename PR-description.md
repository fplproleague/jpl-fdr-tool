# UX/UI audit fixes — routing, performance, touch targets, contrast & stale-data warning

Implements 23 findings from the UX/UI audit. No feature was removed; no data was changed except where a value was demonstrably stale or misleading.

**Build verified:** patch applies cleanly to `main` and `vite build` succeeds.

---

## Headline results

| Metric | Before | After |
|---|---:|---:|
| Initial JS (uncompressed) | 529.7 kB | **218.5 kB** (−59%) |
| Initial JS (gzip) | ~139.9 kB | **~71.4 kB** (−49%) |
| `html2canvas` on first load | Yes (preloaded) | **No** (loaded on demand) |
| Indexable URLs | 1 | **6** |
| WCAG AA failures on core text | 4 | **0** |
| Hover-only `title` tooltips | 34 | 10 (non-critical only) |
| `aria-expanded` / `aria-live` | 0 / 0 | **2 / 6** |

---

## 🔴 Critical

### C1 — Predicted Lineups no longer presents stale data as current
`GW2` was hardcoded in two places while `CURRENT_GW` was `3`, so four days before the GW3 deadline the tab showed two-week-old XIs with no warning. The `lastUpdatedLabel` safety net existed in the component but was empty in all 18 data entries, so nothing could catch it.

- New `PREDICTED_LINEUPS_GW` constant in `constants.js` — the single value to bump when you refresh the data.
- A prominent, non-dismissable warning banner appears automatically whenever `PREDICTED_LINEUPS_GW < CURRENT_GW`, saying explicitly which GW the lineups are for and telling users not to set their team from them.
- All user-facing "GW2" text is now derived from that constant.

**When you update the lineups, change `PREDICTED_LINEUPS_GW` and the banner disappears on its own.**

### C2 — Boosters are now labelled, readable and tappable
Bench Boost / Triple Captain / Recharge were 26×26px icon-only circles in the corner of the pitch whose meaning lived only in a `title` attribute — invisible on phone and iPad, the platforms you prioritise.

- Replaced `BoosterIconButton` with `BoosterButton`: icon **plus visible label** plus explicit status text (`Beschikbaar` / `Actief voor GW3` / `Al gebruikt`).
- Moved out of the pitch's absolute corner into a labelled "Boosters" row above the pitch, so they no longer compete with player cards for space.
- Added `aria-pressed` and a descriptive `aria-label` explaining what each booster does.

### C3 — Price Changes explains itself
Now states that prices only change **from GW7** in the game, so the empty tab reads as "nothing to report yet" rather than "unfinished tool".

### C4 — Contrast fixed on the text that matters most
Empty states (`#6B5289`, 2.51:1) and every tab's intro paragraph (`#8F79AD`, 4.33:1) both failed WCAG AA — precisely the copy a new user needs.

| Token | Was | Now | Page / Card |
|---|---|---|---|
| `textMuted` (intros) | `#8F79AD` | `#A794C2` | 6.02 / 4.98 ✅ |
| `textSubtle` (empty states, footer) | `#6B5289` | `#A594C4` | 6.00 / 4.96 ✅ |
| `textDisabled` | `#5A4A72` | `#8878A5` | 4.15 (was 2.09) |
| Rating-5 cell text (L5) | `#FBEAE7` | `#FFFFFF` | 5.17 ✅ |
| Postponed cell | `#9B93AD` | `#C2BBD1` | 4.90 ✅ |

Hierarchy between "explanation" and "empty state" is preserved — `textSubtle` stays slightly dimmer.

---

## 🟠 High priority

### H1 — Real URLs per tool
Every tab now has its own path: `/fdr`, `/team-planner`, `/predicted-lineups`, `/watchlist`, `/price-changes`.

- New `src/routes.js` — single source of truth for tabs, paths, titles and meta descriptions.
- New `vercel.json` with **explicit** rewrites per route (deliberately not a catch-all, so `/api/*`, `/predicted-xi` and asset paths are untouched).
- Tabs are real `<a href>` elements: middle-click, "open in new tab" and copy-link all work, while normal clicks are intercepted so the app doesn't reload.
- Browser back/forward navigates between tabs via `popstate`.
- `document.title`, `meta[name=description]` and `link[rel=canonical]` update per tab — shared links no longer all preview as "FDR Tool".
- `?r=` and `?ha=` (custom ratings / home advantage) are preserved when switching tabs.
- `sitemap.xml` extended from 1 URL to 6.
- `/` still resolves to the FDR tab, so every existing link keeps working.

### H2 — Code splitting
- The four non-default tabs are `React.lazy` + `Suspense` with a loading state.
- `html2canvas` (199 kB) is now `await import(...)`-ed inside the two download handlers only.
- The `modulepreload` of the 372 kB PitchField chunk is gone from `index.html`.

### H3 — Touch targets decoupled from screen width
Added a `@media (pointer: coarse)` block raising `.fdr-icon-btn` / `.fdr-touch-target` to ≥44×44px. Keyed on **input device**, not viewport — so iPad (820–1024px) finally gets touch-sized controls instead of the mouse layout.

The home-advantage toggle was the worst offender (30×16px, ×18 on screen): the **entire row** (label + switch) is now the button, and the switch itself grew to 34×18.

### H4 — Hover-only tooltips converted
The transfer-budget breakdown now uses your existing `TooltipTrigger` (which already handles tap, hover *and* keyboard correctly). Reasons a button is disabled are rendered as visible text instead of a `title`. Remaining `title` attributes are supplementary only — each has a visible label or `aria-label` alongside.

### H5 — Fonts load in parallel, not last
Moved the Google Fonts `@import` out of the React-injected `<style>` into `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html` (and `predicted-xi.html`). Previously the font request couldn't even start until the whole JS bundle had executed.

### H6 — Sticky first column on the remaining wide tables
Applied the pattern already used by the main FDR table to the "Vergelijk teams" table and the 15-player roster table, both of which scroll horizontally on a phone.

### H7 — Deadline countdown in the header
Visible on **every** tab, showing `Deadline GW3` and a live countdown (`3d 4u` → `4u 12m` → `12m`), turning amber inside the last 3 hours. Previously the deadline was 10px grey text buried in Team Planner only.

---

## 🟡 Medium

- **M2** — Subtle CSS mask fades the right edge of the tab strip so it's discoverable that more tabs exist; the fade turns itself off once scrolled to the end.
- **M4** — New `src/theme.js` with shared `primary` / `secondary` / `danger` / `icon` button styles. `retryButtonStyle` was previously duplicated *verbatim* in two files; now defined once.
- **M5** — Removing a watchlist player is undoable: an 8-second toast with "Ongedaan maken" restores the player **to its original position**. Chose undo over a confirm dialog so the common case isn't interrupted. Remove button grew 22→32px (44px on touch).
- **M6** — Persistent mode banner in Team Planner explaining what a tap does right now, and how to leave the mode. It updates mid-flow ("tap a second player to swap"). This is the fix for three modes where the same tap meant different things.
- **M7** — `aria-expanded` + `aria-controls` on all collapsible sections (with matching panel IDs), `aria-live` on every async player-database load/error.
- **M9** — Screenshot upload promoted: accent border, `Aanrader` badge and upload icon when the roster is empty. **It also had a completely empty `<p>` in the source** — now filled with copy explaining what it does and that nothing is applied until you confirm.
- **M10** — `GW_DEADLINE_ISO` is now the single manually-maintained source of truth. `CURRENT_GW`, all deadline display strings and the countdown are all derived from it. This is the class of bug that caused C1.

  Deadlines render via `Intl.DateTimeFormat` pinned to **`Europe/Brussels`**, so a visitor in any timezone sees the correct Belgian deadline. Verified byte-identical to your previous hardcoded strings under UTC, Brussels and New York.

---

## 🟢 Low / polish

- **L2** — "New" dots removed (6px, hover-only label).
- **L3** — Both magic negative margins (`-36px`, `-18px`) removed; header uses normal flex alignment.
- **L4** — Minileague code is now a compact inline pill instead of a full block occupying prime space above the tabs on mobile.
- **L5** — Rating-5 cell text → white (5.17:1).
- **L6** — Global `:focus-visible` outline in brand teal (keyboard only, never on mouse clicks).
- **L9** — Club picker is a responsive `auto-fill` grid with smaller chips (76px → ~58px, logo 28→24px), so the pitch isn't pushed below five rows of logos on a phone.

---

## Notes for review

- **`Europe/Brussels` is hardcoded** for deadline display. That's deliberate — a Fantasy Pro League deadline is a Belgian time, and converting it per-visitor would be misleading.
- **`vercel.json` lists routes explicitly** rather than a catch-all rewrite, to guarantee `/api/analyze-screenshot` and `/predicted-xi` are unaffected.
- **The private Predicted XI Builder was mostly left alone.** Only the parts shared with the public site (`PitchField`, `PitchSlot`) got contrast updates, plus the font `@import` and the `html2canvas` dynamic import.
- **`PlayerStatusTab.jsx` (dead code) was intentionally left in place** — it wasn't on your list, and deleting files is more invasive than the rest of this PR.
- **Not verified in a real browser.** These changes were validated by code review, a passing production build, computed contrast ratios and unit-checked routing/date logic. The routing, countdown, mask fade and mode banner should get a quick manual pass on a phone before merging.
