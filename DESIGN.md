---
name: TeleBos
description: Multi-account Telegram manager for power users
themes:
  - light
  - dark
colors:
  primary: "#2563eb"
  primary-hover: "#1d4ed8"
  primary-foreground: "#ffffff"
  # Light theme semantic tokens. Contrast must be checked against each actual surface.
  light:
    background: "#f8fafc"
    foreground: "#0f172a"
    card: "#ffffff"
    card-foreground: "#0f172a"
    muted: "#f1f5f9"
    muted-foreground: "#475569"
    secondary: "#f1f5f9"
    secondary-foreground: "#0f172a"
    accent: "#e2e8f0"
    accent-foreground: "#0f172a"
    destructive: "#dc2626"
    destructive-hover: "#b91c1c"
    destructive-foreground: "#ffffff"
    destructive-subtle: "#fef2f2"
    destructive-subtle-foreground: "#dc2626"
    destructive-border: "#fecaca"
    border: "#e2e8f0"
    border-strong: "#cbd5e1"
    input: "#cbd5e1"
    ring: "#2563eb"
  # Dark theme semantic tokens. Contrast must be checked against each actual surface.
  dark:
    background: "#0f172a"
    foreground: "#f8fafc"
    card: "#1e293b"
    card-foreground: "#f8fafc"
    muted: "#0f172a"
    muted-foreground: "#cbd5e1"
    secondary: "#334155"
    secondary-foreground: "#f8fafc"
    accent: "#334155"
    accent-foreground: "#f8fafc"
    destructive: "#dc2626"
    destructive-hover: "#b91c1c"
    destructive-foreground: "#f8fafc"
    destructive-subtle: "rgba(127, 29, 29, 0.35)"
    destructive-subtle-foreground: "#f87171"
    destructive-border: "rgba(153, 27, 27, 0.8)"
    border: "#334155"
    border-strong: "#64748b"
    input: "#64748b"
    ring: "#60a5fa"
  # Persistent Anchor (Fixed dark frame across both themes)
  sidebar:
    background: "#020617"
    surface: "#0f172a"
    border: "#334155"
    foreground: "#94a3b8"
    active: "#60a5fa"
    active-bg: "rgba(59, 130, 246, 0.16)"
  # Backward-compatible flat keys
  background: "#f8fafc"
  foreground: "#0f172a"
  card: "#ffffff"
  muted: "#f1f5f9"
  muted-foreground: "#475569"
  secondary: "#f1f5f9"
  secondary-foreground: "#0f172a"
  accent: "#e2e8f0"
  accent-foreground: "#0f172a"
  destructive: "#dc2626"
  destructive-foreground: "#ffffff"
  border: "#e2e8f0"
  border-strong: "#cbd5e1"
  input: "#cbd5e1"
  ring: "#2563eb"
  sidebar-bg: "#020617"
  sidebar-surface: "#0f172a"
  sidebar-border: "#334155"
  sidebar-foreground: "#94a3b8"
  sidebar-active: "#60a5fa"
  dark-background: "#0f172a"
  dark-foreground: "#f8fafc"
  dark-card: "#1e293b"
  dark-secondary: "#334155"
  dark-muted: "#0f172a"
  dark-muted-foreground: "#cbd5e1"
  dark-accent: "#334155"
  dark-border: "#334155"
  dark-border-strong: "#64748b"
  dark-destructive: "#dc2626"
  dark-ring: "#60a5fa"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.5rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.03em
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.01em
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0
  muted:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  full: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  xxl: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    lightBackground: "{colors.light.secondary}"
    darkBackground: "{colors.dark.secondary}"
    lightTextColor: "{colors.light.secondary-foreground}"
    darkTextColor: "{colors.dark.secondary-foreground}"
    lightBorder: "1px solid {colors.light.border-strong}"
    darkBorder: "1px solid {colors.dark.border-strong}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-outline:
    lightBackground: "#ffffff"
    darkBackground: "rgba(30, 41, 59, 0.6)"
    lightTextColor: "{colors.light.foreground}"
    darkTextColor: "{colors.dark.foreground}"
    lightBorder: "1px solid {colors.light.border-strong}"
    darkBorder: "1px solid {colors.dark.border-strong}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-icon:
    lightBackground: "{colors.light.secondary}"
    darkBackground: "{colors.dark.secondary}"
    lightTextColor: "{colors.light.foreground}"
    darkTextColor: "{colors.dark.foreground}"
    lightBorder: "1px solid {colors.light.border-strong}"
    darkBorder: "1px solid {colors.dark.border-strong}"
    rounded: "{rounded.lg}"
    minWidth: "2rem"
    minHeight: "2rem"
    iconSize: "1rem"
  button-close:
    lightBackground: "{colors.light.destructive-subtle}"
    darkBackground: "{colors.dark.destructive-subtle}"
    lightTextColor: "{colors.light.destructive-subtle-foreground}"
    darkTextColor: "{colors.dark.destructive-subtle-foreground}"
    lightBorder: "1px solid {colors.light.destructive-border}"
    darkBorder: "1px solid {colors.dark.destructive-border}"
    hoverBackground: "{colors.light.destructive}"
    hoverTextColor: "#ffffff"
    rounded: "{rounded.lg}"
    minWidth: "2rem"
    minHeight: "2rem"
    iconSize: "1rem"
  button-ghost:
    backgroundColor: "transparent"
    lightTextColor: "{colors.light.foreground}"
    darkTextColor: "{colors.dark.foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
    height: "2.25rem"
  button-destructive:
    backgroundColor: "{colors.light.destructive}"
    textColor: "{colors.light.destructive-foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  card:
    lightBackground: "{colors.light.card}"
    darkBackground: "{colors.dark.card}"
    lightTextColor: "{colors.light.card-foreground}"
    darkTextColor: "{colors.dark.card-foreground}"
    lightBorder: "1px solid {colors.light.border}"
    darkBorder: "1px solid {colors.dark.border}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md}"
  input:
    lightBackground: "#ffffff"
    darkBackground: "{colors.dark.background}"
    lightTextColor: "{colors.light.foreground}"
    darkTextColor: "{colors.dark.foreground}"
    lightBorder: "1px solid {colors.light.input}"
    darkBorder: "1px solid {colors.dark.input}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
    height: "2.25rem"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "0 0.5rem"
    height: "1.25rem"
---

# Design System: TeleBos

## 1. Overview & Architecture

### Creative North Star: “The Dual-Mode Workbench”

TeleBos is a precision workbench for Telegram account management, broadcasts, and automated workflows. The interface should feel clear, deliberate, dense without being cramped, and consistent across long work sessions. Every interactive element (buttons, icon triggers, close buttons, inputs) must have an unmistakable visual affordance at rest—never invisible or camouflaged against its parent container.

Light and Dark are the only **visual themes**. `system` is a preference mode that selects Light or Dark from the operating system; it is not a third visual theme. Both themes share layout, spacing, component geometry, and interaction behavior.

### Theme behavior

- `light`: always render the Light token set.
- `dark`: always render the Dark token set.
- `system`: follow the operating-system color preference and update when that preference changes.
- Persist the selected preference using the existing theme store and storage key (`telebos_theme`) if those names match the implementation. Verify these names against source code before changing implementation.
- Apply the resolved theme before the first visible paint where possible. Never show the wrong theme briefly while hydration completes.
- Theme transitions may animate color changes for 150–200 ms, but must not delay theme selection or flash the wrong theme.

### Two surface scopes

1. **Adaptive workspace:** page canvas, cards, tables, forms, dialogs, and toolbars use semantic tokens from the active theme.
2. **Persistent dark surfaces:** the sidebar and deliberately dark previews (such as terminal output or chat previews) keep their own explicit dark-surface token scope in both themes. Text, icons, borders, and controls inside them must use that scope—not workspace foreground tokens by accident.

Do not rely on a one-off selector such as `[data-keep-white]` as the only protection against theme inversion. Define explicit foreground/background tokens for each persistent surface and test every nested component.

---

## 2. Color System & Dual-Theme Tokens

### Source of truth

The YAML token block at the top of this document is the canonical palette. The semantic token table below explains how tokens are used; it must not introduce different values for the same token. If a value changes, update the canonical token and all references in one change.

Prefer semantic utilities (`bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `text-muted-foreground`, `border-border`, `border-input`, `ring-ring`) over raw palette utilities. Raw colors are allowed only for intentional branded accents, status colors, destructive/close buttons, illustrations, or explicitly scoped persistent dark surfaces.

The flat compatibility keys at the top represent **Light theme only** for legacy consumers. New code must not use them.

### Canonical token mapping

| Token | Light | Dark | Intended use |
|---|---|---|---|
| `background` / `foreground` | `#f8fafc` / `#0f172a` | `#0f172a` / `#f8fafc` | Workspace canvas (slate-50 in Light so white cards pop) and default text |
| `card` / `card-foreground` | `#ffffff` / `#0f172a` | `#1e293b` / `#f8fafc` | Cards, modals, and elevated containers |
| `muted` / `muted-foreground` | `#f1f5f9` / `#475569` | `#0f172a` / `#cbd5e1` | Recessed surfaces (wells, code blocks, tab tracks) and secondary text |
| `secondary` / `secondary-foreground` | `#f1f5f9` / `#0f172a` | `#334155` / `#f8fafc` | Secondary buttons, utility icon buttons, and interactive pills inside cards |
| `accent` / `accent-foreground` | `#e2e8f0` / `#0f172a` | `#334155` / `#f8fafc` | Hover and active surface state (must be visibly distinct from `card`) |
| `primary` / `primary-foreground` | `#2563eb` / `#ffffff` | `#2563eb` / `#ffffff` | Filled primary actions and branded badges |
| `destructive` / `destructive-foreground` | `#dc2626` / `#ffffff` | `#dc2626` / `#f8fafc` | Filled destructive actions and Close button hover state |
| `destructive-subtle` / `destructive-border` | `#fef2f2` / `#fecaca` | `rgba(127,29,29,0.35)` / `rgba(153,27,27,0.8)` | Close (`X`) buttons, cancel icon buttons, and subtle destructive triggers |
| `border` | `#e2e8f0` | `#334155` | Card boundaries and section dividers |
| `border-strong` / `input` | `#cbd5e1` | `#64748b` | Interactive button borders, input borders, and form controls |
| `ring` | `#2563eb` | `#60a5fa` | Keyboard focus indicator |

The sidebar uses its own invariant scope: background `#020617`, nested surface `#0f172a`, primary text `#f8fafc`, secondary text `#cbd5e1`, muted text `#94a3b8`, active accent `#60a5fa`, and active background `rgba(59, 130, 246, 0.16)`. Use a visible sidebar border such as `#334155` only where a boundary is needed; do not use the canvas color as the border.

### Contrast & Affordance Requirements

- **Normal text:** minimum 4.5:1 against the **actual rendered background**.
- **Large text** (at least 24 CSS px regular, or about 18.66 CSS px bold): minimum 3:1.
- **Interactive Control Boundaries (Buttons, Inputs, Icon Triggers):** Every clickable button or input placed inside a card MUST be visually distinguishable from the card surface at rest (without requiring hover to discover it). Use a contrasting background fill (`bg-secondary` / `bg-slate-100` in Light, `bg-slate-700` in Dark) AND/OR a strong border (`border-slate-300` `#cbd5e1` in Light, `border-slate-500` `#64748b` in Dark).
- **Zero "White-on-White" or "Slate-on-Slate" Camouflage:** Never render a white/transparent button with a transparent or `#e2e8f0` border inside a white `#ffffff` card. Never render a `#1e293b` button inside a `#1e293b` dark card.

### Surface hierarchy

**Light mode**
1. **Workspace Canvas:** `#f8fafc` (`bg-slate-50`).
2. **Card / Floating Surface:** `#ffffff` (`bg-white`), bordered with `#e2e8f0` (`border-slate-200`).
3. **Interactive Control / Button inside Card:** `#f1f5f9` (`bg-slate-100`) with border `#cbd5e1` (`border-slate-300`), hover `#e2e8f0` (`bg-slate-200`).
4. **Close / Cancel Button Surface:** `#fef2f2` (`bg-rose-50`) with border `#fecaca` (`border-rose-200`) and text `#dc2626` (`text-rose-600`).

**Dark mode**
1. **Workspace Canvas:** `#0f172a` (`bg-slate-900`).
2. **Card / Floating Surface:** `#1e293b` (`bg-slate-800`), bordered with `#334155` (`border-slate-700`).
3. **Interactive Control / Button inside Card:** `#334155` (`bg-slate-700`) with border `#64748b` (`border-slate-500`), hover `#475569` (`bg-slate-600`).
4. **Recessed Well inside Card:** `#0f172a` (`bg-slate-900`).
5. **Close / Cancel Button Surface:** `bg-rose-950/60` with border `border-rose-800/80` and text `text-rose-400`.

### Text hierarchy

- **Primary text:** `foreground` (`#0f172a` Light / `#f8fafc` Dark) or `card-foreground`.
- **Secondary text:** `muted-foreground` (`#475569` `text-slate-600` on Light surfaces; `#cbd5e1` `text-slate-300` on Dark surfaces).
- **Light-mode readable text:** NEVER use `text-slate-400` (`#94a3b8`) on white or light gray for normal text or button icons; contrast is only ~2.56:1 and makes icons look invisible or disabled.
- **Dark-mode readable text:** NEVER use raw `text-slate-500` (`#64748b`) for normal text or active icons on dark cards.
- **Disabled controls:** Prefer explicit disabled tokens (`bg-slate-100 text-slate-400 border-slate-200` in Light; `bg-slate-800/50 text-slate-500 border-slate-700/50` in Dark) with `cursor-not-allowed` over indiscriminate `opacity-50` on already-subtle buttons.

### Status colors (Canonical Palette)

Use semantic status colors only when they communicate status (success, warning, error, information) or destructive/close intent. Status badges must use a tinted background, a subtle border, and text with a verified contrast ratio (≥ 4.5:1):

| Status Role | Light Foreground | Light Tint BG | Dark Foreground | Dark Tint BG | Usage Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Success** | `#15803d` (green-700) | `#f0fdf4` (green-50) | `#4ade80` (green-400) | `rgba(34, 197, 94, 0.15)` | Active accounts, completed orders, healthy proxies |
| **Warning** | `#b45309` (amber-700) | `#fffbeb` (amber-50) | `#fbbf24` (amber-400) | `rgba(245, 158, 11, 0.15)` | Rate limits, cooldowns, pending transactions |
| **Error / Destructive** | `#dc2626` (red-600) | `#fef2f2` (red-50) | `#f87171` (red-400) | `rgba(239, 68, 68, 0.20)` | Flood waits, revoked sessions, failed broadcasts, **Close/Cancel buttons** |
| **Info** | `#0369a1` (sky-700) | `#f0f9ff` (sky-50) | `#38bdf8` (sky-400) | `rgba(56, 189, 248, 0.15)` | Telegram channel metadata, informational notices |

---

## 3. Typography

TeleBos uses a single font family for the entire application to ensure mechanical precision and eliminate font-pairing inconsistencies.

- **Primary Stack:** Inter (`Inter, ui-sans-serif, system-ui, sans-serif`).
- **Monospace Stack:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`.

### Typographic Scale & Theme Mapping

| Scale Level | Weight & Size | Line Height | Tracking | Light Mode Class | Dark Mode Class | Usage Context |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Display** | 800 (ExtraBold), `clamp(2.25rem, 5vw, 3.5rem)` | 1.1 | `-0.03em` | `text-slate-900` | `text-white` | Landing page hero only. Never inside dashboard. |
| **Headline**| 700 (Bold), `clamp(1.5rem, 3vw, 2rem)` | 1.2 | `-0.02em` | `text-slate-900` | `text-slate-100` | Dashboard page titles, modal headers. |
| **Title** | 600 (Semibold), `1rem` (16px) | 1.4 | `-0.01em` | `text-slate-900` | `text-slate-100` | Card titles, section headers, dialog titles. |
| **Body** | 400 (Regular), `0.875rem` (14px) | 1.6 | Normal | `text-slate-700` | `text-slate-200` | Standard table content, paragraphs, form entries. |
| **Label** | 500 (Medium), `0.8125rem` (13px) | 1.25 | Normal | `text-slate-900` | `text-slate-200` | Form labels, table column headers, tab triggers. |
| **Muted** | 400 (Regular), `0.8125rem` (13px) | 1.4 | Normal | `text-slate-600` | `text-slate-300` | Timestamps, secondary IDs, help descriptions. |
| **Mono** | 400 (Regular), `0.8125rem` (13px) | 1.5 | Normal | `text-slate-800` | `text-slate-200` | Telegram user IDs, phone numbers, session strings. |

---

## 4. Elevation, Borders & Transitions

TeleBos relies on crisp boundaries and distinct surface layering rather than heavy drop shadows.

### Border Strategy
- **Light Mode:**
  - Cards & Containers: `1px solid #e2e8f0` (`border-slate-200`) on a `#ffffff` card over a `#f8fafc` canvas.
  - Interactive Controls (Buttons, Inputs, Icon Buttons): **MUST** use `1px solid #cbd5e1` (`border-slate-300`) so they never disappear against a white card.
- **Dark Mode:**
  - Cards & Containers: `1px solid #334155` (`border-slate-700`) on a `#1e293b` card over a `#0f172a` canvas.
  - Interactive Controls (Buttons, Inputs, Icon Buttons): **MUST** use `1px solid #64748b` (`border-slate-500`) or `border-slate-600` paired with a `#334155` (`bg-slate-700`) surface.

### Shadows
- **Resting Cards:** `shadow-xs` in Light Mode (`0 1px 2px 0 rgba(15, 23, 42, 0.04)`); `shadow-none` in Dark Mode.
- **Interactive Card Hover:**
  - Light Mode: `shadow-md shadow-slate-900/5 border-slate-300` + subtle upward transform (`-translate-y-[1px]`).
  - Dark Mode: `border-slate-500 bg-slate-800/90`.
- **Dropdowns & Popovers:**
  - Light Mode: `shadow-lg shadow-slate-900/10 border border-slate-300 bg-white text-slate-900`.
  - Dark Mode: `shadow-xl shadow-black/40 border border-slate-700 bg-slate-800 text-slate-100`.

---

## 5. Component Specifications (Dual-Theme Implementation)

### 1. Buttons & Icon Triggers (CRITICAL VISIBILITY RULES)

Standard text button height is **2.25rem (36px / `h-9`)** with `rounded-lg` (8px corners) and `text-sm font-medium`.
**NEVER create an unboxed/naked icon button (`bg-transparent border-transparent`) on a workspace or card surface.**

- **Primary Button:**
  - Fill: `bg-primary` (`#2563eb`), Text: `text-white` (`#ffffff`).
  - Hover: `hover:bg-primary-hover` (`#1d4ed8`).
  - Focus: `focus-visible:ring-2 focus-visible:ring-primary/50`.

- **Secondary Button (Default for non-primary actions inside cards):**
  - Light: `bg-slate-100 text-slate-900 border border-slate-300 hover:bg-slate-200 hover:border-slate-400`.
  - Dark: `bg-slate-700 text-slate-100 border border-slate-500 hover:bg-slate-600`.

- **Outline Button:**
  - Light: `bg-white text-slate-900 border border-slate-300 hover:bg-slate-100 hover:border-slate-400 shadow-2xs`. (Never use `border-slate-200` or `border-transparent` on a white card).
  - Dark: `bg-slate-800/80 text-slate-100 border border-slate-500 hover:bg-slate-700`.

- **Utility Icon Button (Refresh, Sync, Filter, Copy, Settings, More):**
  - **Prohibition:** NEVER render a standalone `<svg>` inside a bare `<button class="hover:text-primary-600">` with `h-3 w-3` and no background/border.
  - **Sizing:** Minimum `h-8 w-8` (`32px x 32px`) or `h-9 w-9` (`36px x 36px`), `rounded-lg`, centered flex container. Minimum SVG icon size is `h-4 w-4` (`16px`).
  - **Light Mode:** `bg-slate-100 text-slate-700 border border-slate-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300`.
  - **Dark Mode:** `bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600 hover:text-blue-400 hover:border-blue-500/60`.
  - **Canonical Markup Example (Refresh Button):**
    ```html
    <button
      type="button"
      title="Refresh stats now"
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:border-blue-500/60 dark:hover:bg-slate-600 dark:hover:text-blue-400 cursor-pointer"
    >
      <svg class="h-4 w-4" ...><!-- lucide-refresh-cw --></svg>
    </button>
    ```

- **Close / Dismiss / Cancel Icon Button (`X` button on Modals, Dialogs, Drawers, Toasts, Banners, or Cancel slots):**
  - **Requirement:** Close and Cancel (`X`) buttons MUST immediately communicate their dismissive/destructive nature at rest using a red/rose tinted surface and border, turning solid red with white icon on hover. Never style a Close (`X`) button as a gray transparent ghost button (`text-slate-500 bg-transparent border-transparent`), which becomes invisible against light surfaces.
  - **Sizing:** `h-8 w-8` (`32px`) or `h-9 w-9` (`36px`), `rounded-lg`, icon size `h-4 w-4` (16px) or `h-5 w-5` (20px).
  - **Light Mode:** `bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-600 hover:text-white hover:border-rose-600`.
  - **Dark Mode:** `bg-rose-950/60 text-rose-400 border border-rose-800/80 hover:bg-rose-600 hover:text-white hover:border-rose-500`.
  - **Canonical Markup Example (Dialog Close / Cancel `X` Button):**
    ```html
    <button
      type="button"
      data-slot="dialog-close"
      aria-label="Close"
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition-colors hover:border-rose-600 hover:bg-rose-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:pointer-events-none disabled:opacity-50 dark:border-rose-800/80 dark:bg-rose-950/60 dark:text-rose-400 dark:hover:border-rose-500 dark:hover:bg-rose-600 dark:hover:text-white cursor-pointer"
    >
      <svg class="h-4 w-4" ...><!-- lucide-x --></svg>
      <span class="sr-only">Close</span>
    </button>
    ```

- **Destructive Action Button (Delete, Revoke, Purge):**
  - Primary Solid Destructive: `bg-red-600 text-white hover:bg-red-700 border border-red-700 shadow-xs`.
  - Secondary / Subtle Destructive (Cancel text button, Remove filter, Clear):
    - Light: `bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-600 hover:text-white hover:border-rose-600`.
    - Dark: `bg-rose-950/50 text-rose-300 border border-rose-800/80 hover:bg-rose-600 hover:text-white hover:border-rose-500`.

- **Ghost Button (Strictly Restricted):**
  - **Restriction:** NEVER use `button-ghost` (`bg-transparent border-transparent`) for standalone actions inside cards, headers, or modals (such as Close, Refresh, or Cancel). Ghost style is ONLY permitted for inactive items inside a bordered navigation bar, segmented control track (`bg-slate-100 dark:bg-slate-900`), or dropdown menu rows where the parent container already frames the group.

---

### 2. Cards & Bento Containers

Cards organize telemetry, account lists, and action consoles.

- **Structure:**
  - Corner Radius: `rounded-xl` (12px).
  - Padding: `p-4` (16px) or `p-6` (24px) for major sections.
- **Surfaces:**
  - Light: `bg-white text-slate-900 border border-slate-200 shadow-xs` (placed on top of `bg-slate-50` page background).
  - Dark: `bg-slate-800 text-slate-100 border border-slate-700`.
- **Card Header & Action Bar:**
  - Title: `text-base font-semibold text-card-foreground`.
  - Subtitle: `text-sm text-muted-foreground`.
  - Header Action Buttons (e.g., Refresh, Add, Close): Must use **Utility Icon Button**, **Secondary Button**, or **Close Button** styles above—never unstyled icons.
- **Card Footer:**
  - Light: `bg-slate-50 border-t border-slate-200 px-4 py-3`.
  - Dark: `bg-slate-900/50 border-t border-slate-700 px-4 py-3`.

---

### 3. Form Inputs, Selects & Textareas

Form controls must guarantee high contrast and unambiguous boundaries on both page backgrounds and inside cards.

- **Geometry:** Height `2.25rem` (36px), padding `px-3 py-2`, `rounded-lg` (8px).
- **Light Theme:**
  - Surface: `bg-white`.
  - Border: `border border-slate-300` (`#cbd5e1`) — never use `border-slate-200` on inputs inside white cards.
  - Hover: `hover:border-slate-400`.
  - Text: `text-slate-900`.
  - Placeholder: `placeholder:text-slate-500`.
  - Focus: `focus:border-primary focus:ring-2 focus:ring-primary/20`.
- **Dark Theme:**
  - Surface: `bg-slate-900` (`#0f172a`) so inputs appear distinctly recessed inside `#1e293b` cards.
  - Border: `border border-slate-600` (`#475569`) or `border-slate-500` (`#64748b`).
  - Text: `text-slate-100`.
  - Placeholder: `placeholder:text-slate-400`.
  - Focus: `focus:border-blue-400 focus:ring-2 focus:ring-blue-400/25`.
- **Error State:**
  - Light: `border-red-500 focus:ring-red-500/20 text-red-900 bg-red-50/30`.
  - Dark: `border-red-500 focus:ring-red-500/25 text-red-100 bg-red-950/20`.

---

### 4. Tables & Data Grids

Tables manage high-density account sessions, proxy latency, and broadcast queues.

- **Responsive Wrapper:** All multi-column data tables must be wrapped in `<div className="w-full overflow-x-auto scrollbar-thin border border-slate-200 dark:border-slate-700 rounded-xl">`.
- **Table Header:**
  - Light: `bg-slate-100 text-slate-700 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider`.
  - Dark: `bg-slate-900 text-slate-300 border-b border-slate-700 text-xs font-semibold uppercase tracking-wider`.
- **Data Rows:**
  - Light: `bg-white border-b border-slate-200 hover:bg-slate-50 text-slate-700`.
  - Dark: `bg-slate-800 border-b border-slate-700/70 hover:bg-slate-700/50 text-slate-200`.
- **Row Action Buttons:** Action triggers inside table rows (Edit, Refresh, Delete/Close) must use boxed `button-icon` or `button-close` styles (`h-7 w-7` or `h-8 w-8`) with visible borders and backgrounds.

---

### 5. Dialogs, Modals & Sheets

- **Backdrop:**
  - Light: `bg-slate-950/40 backdrop-blur-sm`.
  - Dark: `bg-black/75 backdrop-blur-sm`.
- **Modal Surface:**
  - Light: `bg-white border border-slate-300 rounded-2xl shadow-2xl p-6 text-slate-900`.
  - Dark: `bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100`.
- **Modal / Sheet Close Button (`data-slot="dialog-close"`):**
  - Position: `absolute right-4 top-4`.
  - **Mandatory Styling:** Must use the **Close / Dismiss Button** specification:
    - Light: `bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-600 hover:text-white hover:border-rose-600 rounded-lg h-8 w-8 inline-flex items-center justify-center transition-colors`.
    - Dark: `dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800/80 dark:hover:bg-rose-600 dark:hover:text-white dark:hover:border-rose-500`.

---

### 6. Loading Skeletons & Shimmer States

- **Light Mode:** Base `bg-slate-200` shimmering to `bg-slate-100`.
- **Dark Mode:** Base `bg-slate-700` shimmering to `bg-slate-800`.

---

### 7. Tooltips & Popovers

- **Theme Scope:** Always render with high-contrast boundaries (`bg-slate-900 text-slate-100 border border-slate-700 shadow-lg`).
- **Geometry:** `px-2.5 py-1 text-xs font-medium rounded-md`.

---

### 8. Form Controls Disabled States

- **Light Theme:** `bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed`.
- **Dark Theme:** `bg-slate-900/60 text-slate-500 border border-slate-700/60 cursor-not-allowed`.
- Never apply `disabled:opacity-50` to an unbordered button; the control must retain a visible box and border even when disabled.

---

### 9. Responsive Breakpoints & Mobile Navigation

- `sm`: `640px`, `md`: `768px`, `lg`: `1024px` (**Sidebar Collapse Threshold**), `xl`: `1280px`, `2xl`: `1536px`.
- On screens `< 1024px` (`lg`), the persistent sidebar collapses off-canvas into a slide-over `Sheet` (drawer). The close button inside the dark mobile drawer must also use the high-visibility rose/red `button-close` style (`bg-rose-950/80 text-rose-400 border border-rose-800 hover:bg-rose-600 hover:text-white`).

---

## 6. Low-Contrast & "Invisible UI" Prevention Guardrails

Every UI change and component review must enforce these hard rules:

1. **No Invisible / Naked Buttons:** Every `<button>` (including icon-only buttons like Refresh, Sync, Edit, Close, Cancel) MUST have a visible background fill AND a visible border at rest. `border-transparent` and `bg-transparent` are strictly forbidden on standalone buttons.
2. **Red Close & Cancel Buttons:** All Close (`X`) buttons (`data-slot="dialog-close"`, modal close, drawer close, toast close, cancel icon buttons) MUST be styled in red/rose (`bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-600 hover:text-white` in Light; `dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800/80 dark:hover:bg-rose-600 dark:hover:text-white` in Dark). Never use gray text (`text-slate-500`) on a white/transparent background for close buttons.
3. **Distinct Utility Icon Buttons:** Utility icon triggers (e.g., `lucide-refresh-cw`) must be at least `32px x 32px` (`h-8 w-8`), use at least a `16px` (`h-4 w-4`) icon, and have a contrasting surface (`bg-slate-100 border-slate-300 text-slate-700` in Light; `bg-slate-700 border-slate-600 text-slate-200` in Dark).
4. **No Same-Color Nesting:**
   - Light Mode: Page background is `#f8fafc` (`bg-slate-50`), Card is `#ffffff` (`bg-white`), Button inside Card is `#f1f5f9` (`bg-slate-100`) with border `#cbd5e1` (`border-slate-300`).
   - Dark Mode: Page background is `#0f172a` (`bg-slate-900`), Card is `#1e293b` (`bg-slate-800`), Button inside Card is `#334155` (`bg-slate-700`) with border `#64748b` (`border-slate-500`).
5. **Protect the Sidebar Scope:** Sidebar and persistent dark previews need explicit foreground, muted, active, border, and control tokens.

### Required acceptance checklist

- [ ] Verify no `<button>` uses `border-transparent` or lacks a background fill unless it is inside a segmented tab track or dropdown menu item.
- [ ] Verify all Close (`X`) and Cancel icon buttons are visibly red at rest (`bg-rose-50 text-rose-600 border-rose-200`) and turn solid red with white text/icon on hover (`hover:bg-rose-600 hover:text-white`).
- [ ] Verify all utility icon buttons (Refresh, Filter, Copy, etc.) have a visible box (`h-8 w-8` min), border (`border-slate-300` Light / `border-slate-600` Dark), and surface fill (`bg-slate-100` Light / `bg-slate-700` Dark), with icons at least `h-4 w-4`.
- [ ] Verify white cards (`#ffffff`) sit on a `#f8fafc` (`slate-50`) background in Light mode, and buttons inside cards never use pure `#ffffff` without a `border-slate-300` border.
- [ ] Verify dark cards (`#1e293b`) contain buttons with `#334155` (`bg-slate-700`) fill so buttons do not blend into the card.

---

## 7. Do's and Don'ts Matrix

### Do:
- **Do** style all Close (`X`) and Cancel icon buttons with a red/rose surface, red border, and solid red hover state (`bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-600 hover:text-white`).
- **Do** give every icon button (like Refresh) a visible container (`h-8 w-8 rounded-lg border border-slate-300 bg-slate-100 text-slate-700`) and an icon size of at least `h-4 w-4`.
- **Do** keep `light.background` at `#f8fafc` (`slate-50`) so `#ffffff` cards and controls have clear depth.
- **Do** use `bg-slate-700` (`#334155`) for secondary buttons and hover states inside `#1e293b` dark cards.
- **Do** use `border-slate-300` (`#cbd5e1`) on inputs and outline buttons in Light mode.

### Don't:
- **Don't** create "naked" icon buttons (`<button class="hover:text-primary-600"><svg class="h-3 w-3">`) with no background, no border, and tiny `12px` icons.
- **Don't** use `border-transparent`, `bg-transparent`, or `text-slate-500 hover:bg-slate-100` on Close (`X`) or Cancel buttons.
- **Don't** put a `#ffffff` button with a `#e2e8f0` border inside a `#ffffff` card (causes invisible UI in Light mode).
- **Don't** put a `#1e293b` button inside a `#1e293b` card (causes invisible UI in Dark mode).
- **Don't** use `text-slate-400` on white or raw `text-slate-500` on dark cards for readable text or active icons.