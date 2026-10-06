---
name: TeleBos
description: Multi-account Telegram manager for power users
themes:
  - light
  - dark
colors:
  primary: "#3b82f6"
  primary-hover: "#2563eb"
  primary-foreground: "#ffffff"
  # Light Theme Tokens (WCAG AA Compliant >= 4.5:1)
  light:
    background: "#ffffff"
    foreground: "#0f172a"
    card: "#ffffff"
    card-foreground: "#0f172a"
    muted: "#f1f5f9"
    muted-foreground: "#64748b"
    secondary: "#f1f5f9"
    secondary-foreground: "#0f172a"
    accent: "#f1f5f9"
    accent-foreground: "#0f172a"
    destructive: "#ef4444"
    destructive-foreground: "#ffffff"
    border: "#e2e8f0"
    input: "#e2e8f0"
    ring: "#3b82f6"
  # Dark Theme Tokens (WCAG AA Compliant >= 4.5:1)
  dark:
    background: "#0f172a"
    foreground: "#f8fafc"
    card: "#1e293b"
    card-foreground: "#f8fafc"
    muted: "#1e293b"
    muted-foreground: "#cbd5e1"
    secondary: "#1e293b"
    secondary-foreground: "#f8fafc"
    accent: "#1e293b"
    accent-foreground: "#f8fafc"
    destructive: "#7f1d1d"
    destructive-foreground: "#f8fafc"
    border: "#334155"
    input: "#334155"
    ring: "#60a5fa"
  # Persistent Anchor (Fixed dark frame across both themes)
  sidebar:
    background: "#020617"
    surface: "#0f172a"
    border: "#0f172a"
    foreground: "#94a3b8"
    active: "#3b82f6"
    active-bg: "rgba(59, 130, 246, 0.1)"
  # Backward-compatible flat keys
  background: "#ffffff"
  foreground: "#0f172a"
  card: "#ffffff"
  muted: "#f1f5f9"
  muted-foreground: "#64748b"
  secondary: "#f1f5f9"
  secondary-foreground: "#0f172a"
  accent: "#f1f5f9"
  accent-foreground: "#0f172a"
  destructive: "#ef4444"
  destructive-foreground: "#ffffff"
  border: "#e2e8f0"
  input: "#e2e8f0"
  ring: "#3b82f6"
  sidebar-bg: "#020617"
  sidebar-surface: "#0f172a"
  sidebar-border: "#0f172a"
  sidebar-foreground: "#94a3b8"
  sidebar-active: "#3b82f6"
  dark-background: "#0f172a"
  dark-foreground: "#f8fafc"
  dark-card: "#1e293b"
  dark-secondary: "#1e293b"
  dark-muted: "#1e293b"
  dark-muted-foreground: "#cbd5e1"
  dark-accent: "#1e293b"
  dark-border: "#334155"
  dark-destructive: "#7f1d1d"
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
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
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
  button-outline:
    backgroundColor: "transparent"
    lightTextColor: "{colors.light.foreground}"
    darkTextColor: "{colors.dark.foreground}"
    lightBorder: "1px solid {colors.light.border}"
    darkBorder: "1px solid {colors.dark.border}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "transparent"
    lightTextColor: "{colors.light.muted-foreground}"
    darkTextColor: "{colors.dark.muted-foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
    height: "2.25rem"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
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
    lightBackground: "{colors.light.background}"
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

### Creative North Star: "The Dual-Mode Workbench"

TeleBos is a precision instrument designed for Telegram power users managing high-volume broadcasts, account fleets, and automated workflows. The interface functions like an engineered workbench: every tool is readily accessible, segregated by domain, and built for sustained operational focus without cognitive exhaustion.

TeleBos treats **Light Mode** and **Dark Mode** as first-class, equal-status themes. Both themes share identical layout geometry, information density, and interactive states, while providing rigorous WCAG 2.1 AA compliance (contrast ratio ≥ 4.5:1 for body and secondary text, ≥ 3.0:1 for large text and interactive components).

### The Dual-Layer Architecture

To maintain spatial grounding while allowing seamless theme switching, TeleBos implements a dual-layer architectural model:

1. **Persistent Anchor Frame (Theme-Independent)**
   - **The Left Sidebar Navigation** (`#020617` Sidewall) remains consistently dark in **both** light and dark themes. This permanent dark mast provides an unwavering frame of reference, grounds the application hierarchy, and eliminates jarring layout shifts during theme toggling.
   - Hardcoded dark panels (e.g., Telegram Web K chat emulator previews and terminal logs) remain on dark surfaces across both modes.
2. **Adaptive Workspace Canvas (Theme-Responsive)**
   - All workspace pages, dashboards, analytical tables, forms, cards, modal dialogs, and toolbars dynamically respond to the active theme (`light` or `dark`).
   - Theme switching is orchestrated by Zustand (`theme-store.ts`), backed by `localStorage` (`telebos_theme`), and respects the user's OS preference (`system` default).
   - Global stylesheet tokens (`tokens.css`), theme transitions (`base.css`), and the utility mapping layer (`dark-bridge.css`) ensure synchronized visual transitions without unstyled flashes or low-contrast artifacts.

---

## 2. Color System & Dual-Theme Tokens

TeleBos enforces a disciplined slate-and-blue palette. The system rejects warm cream/beige tones, neon pastels, and decorative gradients. Every color token maps to a specific functional role and meets strict accessibility minimums.

### Dual-Theme Token Specification Matrix

| Token Name | CSS Custom Property | Tailwind Utility | Light Theme Value | Dark Theme Value | Contrast Ratio vs Surface | Primary Role |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Canvas Background** | `--background` | `bg-background` | `hsl(0 0% 100%)` (`#ffffff`) | `hsl(222.2 47.4% 11.2%)` (`#0f172a`) | Base Surface | Deep workspace canvas |
| **Canvas Foreground** | `--foreground` | `text-foreground` | `hsl(222.2 84% 4.9%)` (`#020817`) | `hsl(210 40% 98%)` (`#f8fafc`) | ~19.5:1 (L) / ~13:1 (D) | Primary text, titles, headings |
| **Card Surface** | `--card` | `bg-card` | `hsl(0 0% 100%)` (`#ffffff`) | `hsl(217.2 32.6% 17.5%)` (`#1e293b`) | Elevated Surface | Dashboard panels, bento boxes |
| **Card Foreground** | `--card-foreground` | `text-card-foreground` | `hsl(222.2 84% 4.9%)` (`#020817`) | `hsl(210 40% 98%)` (`#f8fafc`) | ~19.5:1 (L) / ~10.5:1 (D) | Text inside cards |
| **Primary Accent** | `--primary` | `bg-primary`, `text-primary` | `hsl(221.2 83.2% 53.3%)` (`#3b82f6`) | `hsl(221.2 83.2% 53.3%)` (`#3b82f6`) | ~4.6:1 on white (L) | Primary CTA fill, active marks |
| **Primary Foreground**| `--primary-foreground` | `text-primary-foreground` | `hsl(210 40% 98%)` (`#ffffff`) | `hsl(210 40% 98%)` (`#ffffff`) | 8.2:1 against Tool Blue | Text inside filled primary buttons |
| **Secondary Surface** | `--secondary` | `bg-secondary` | `hsl(210 40% 96.1%)` (`#f1f5f9`) | `hsl(217.2 32.6% 22%)` (`#243248`) | Subtle Surface | Secondary buttons, chips, card headers |
| **Secondary Text** | `--secondary-foreground` | `text-secondary-foreground` | `hsl(222.2 47.4% 11.2%)` (`#0f172a`) | `hsl(210 40% 98%)` (`#f8fafc`) | ≥ 12:1 against secondary | Text on secondary elements |
| **Muted Surface** | `--muted` | `bg-muted` | `hsl(210 40% 96.1%)` (`#f1f5f9`) | `hsl(217.2 32.6% 22%)` (`#243248`) | Recessed Surface | Disabled states, table headers |
| **Muted Text** | `--muted-foreground` | `text-muted-foreground` | `hsl(215.4 16.3% 46.9%)` (`#64748b`) | `hsl(217 24% 78%)` (`#cbd5e1`) | **4.6:1 (L) / 6.5:1 (D)** | Metadata, descriptions, hints |
| **Border & Divider** | `--border` | `border-border` | `hsl(214.3 31.8% 91.4%)` (`#e2e8f0`) | `hsl(217.2 25% 27%)` (`#334155`) | Hairline boundary | Card edges, inputs, dividers |
| **Input Border** | `--input` | `border-input` | `hsl(214.3 31.8% 91.4%)` (`#e2e8f0`) | `hsl(217.2 25% 27%)` (`#334155`) | Hairline boundary | Text fields, selectors, textareas |
| **Focus Ring** | `--ring` | `ring-ring` | `hsl(221.2 83.2% 53.3%)` (`#3b82f6`) | `hsl(217 91% 68%)` (`#60a5fa`) | ≥ 3.0:1 boundary | Keyboard focus outlines |
| **Destructive Action**| `--destructive` | `bg-destructive` | `hsl(0 84.2% 60.2%)` (`#ef4444`) | `hsl(0 62.8% 30.6%)` (`#7f1d1d`) | Error state | Deletions, bans, critical alerts |

---

### Surface Elevation Ladders

Depth in TeleBos is achieved via **tonal layering**, not diffuse box shadows. Each theme uses an ascending ladder of luminance:

#### Light Mode Surface Ladder (Ascending Brightness & Density)
1. **Base Canvas:** `#ffffff` (`bg-background`) — Main background for dashboard pages.
2. **Subtle Surface:** `#f8fafc` (`bg-slate-50`) — Table alternate rows, search filter bars.
3. **Card Container:** `#ffffff` (`bg-card`) with a 1px border `border-slate-200` (`#e2e8f0`) — Structured bento cards.
4. **Secondary Surface:** `#f1f5f9` (`bg-slate-100`) — Button backgrounds, active tab strips.
5. **Floating Panels:** `#ffffff` with subtle `shadow-lg shadow-slate-900/5` and border `border-slate-200` — Modals, popovers, dropdowns.

#### Dark Mode Surface Ladder (Ascending Luminance)
1. **Base Canvas:** `#0f172a` (`hsl(222.2 47.4% 11.2%)`) — Deep Slate workspace floor.
2. **Subtle Surface:** `hsl(215 20% 14%)` — Form control backgrounds, disabled surfaces.
3. **Card Container:** `#1e293b` (`hsl(217.2 32.6% 17.5%)`) with 1px border `border-slate-700/60` — Primary card panels.
4. **Secondary Surface:** `hsl(217.2 32.6% 22%)` (`#243248`) — Inner wells, table headers, hover rows.
5. **Raised Surface:** `hsl(215 20% 30%)` (`#334155`) — Floating badges, active segmentation pills.
6. **Floating Panels:** `#1e293b` with border `border-slate-700` and `shadow-2xl shadow-black/50` — Modals, dropdown menus.

---

### Text Contrast Ladders (Zero Low-Contrast Protocol)

To eliminate unreadable low-contrast text across the application, every text level is calibrated against its corresponding surface:

#### Light Mode Text Hierarchy
- **Heading / Heavy:** `text-slate-900` (`#0f172a`) — **16:1 contrast** against white. Used for page titles and card headlines.
- **Body / Standard:** `text-slate-700` (`#334155`) or `text-slate-800` (`#1e293b`) — **8.9:1 to 12.5:1 contrast**. Used for table content, paragraph copy, and form values.
- **Muted / Secondary:** `text-slate-500` (`#64748b`) or `text-muted-foreground` — **4.6:1 contrast** (passes WCAG AA 4.5:1 minimum). Used for metadata, subtitles, timestamps.
  > [!IMPORTANT]
  > **Light Mode Rule:** Never use `text-slate-400` (`#94a3b8`) for readable text on a light canvas. Its contrast ratio is only 2.6:1 and violates accessibility requirements.
- **Placeholders & Hints:** `placeholder:text-slate-500` (`#64748b`, 4.6:1).
- **Disabled Text:** `text-slate-400` with disabled attribute and reduced cursor opacity.

#### Dark Mode Text Hierarchy
- **Heading / Heavy:** `text-slate-50` (`#f8fafc`) or `text-foreground` — **13:1 contrast** against `#1e293b`. Used for page titles and card headlines.
- **Body / Standard:** `text-slate-200` (`#e2e8f0`) — **10.2:1 contrast**. Used for table content, paragraphs, form entries.
- **Muted / Secondary:** `text-slate-300` / `hsl(217 24% 78%)` (`#cbd5e1`) or `text-muted-foreground` — **6.5:1 contrast** against `#1e293b`. Used for metadata, subtitles, timestamps.
  > [!IMPORTANT]
  > **Dark Mode Rule:** Never leave raw `text-slate-500` unmapped on dark surfaces (it drops to 2.8:1). Use `text-muted-foreground` or `dark:text-slate-300` so contrast remains ≥ 6:1.
- **Placeholders & Hints:** `placeholder:text-slate-400` (`hsl(215 12% 76%)`, 5.2:1).
- **Primary Text Links on Dark:** When blue text appears on dark surfaces, use `text-blue-400` (`#60a5fa`, 5.8:1) or `text-primary-300` (`#93c5fd`, 8.1:1). Never use raw mid-blue `text-primary` (`#3b82f6`) as bare text on dark surfaces (it achieves only 2.8:1).

---

### Status Badges & Functional Accents Matrix

Status indicators must retain strong contrast and recognizability in both themes. Badges use a tinted background, subtle border, and high-contrast text:

| Status Role | Light Mode Classes | Light Preview | Dark Mode Classes | Dark Preview |
| :--- | :--- | :--- | :--- | :--- |
| **Success / Active** | `bg-emerald-50 text-emerald-800 border border-emerald-200` | Emerald-800 on pale green (~6.5:1) | `bg-emerald-950/40 text-emerald-400 border border-emerald-800/50` | Emerald-400 on deep green (~8.2:1) |
| **Warning / Idle / Refill** | `bg-amber-50 text-amber-800 border border-amber-200` | Amber-800 on pale amber (~6.8:1) | `bg-amber-950/40 text-amber-300 border border-amber-800/50` | Amber-300 on deep amber (~9.1:1) |
| **Destructive / Error / Ban** | `bg-rose-50 text-rose-800 border border-rose-200` | Rose-800 on pale rose (~7.0:1) | `bg-rose-950/40 text-rose-300 border border-rose-800/50` | Rose-300 on deep rose (~8.5:1) |
| **Info / Telegram Primary** | `bg-blue-50 text-blue-800 border border-blue-200` | Blue-800 on pale blue (~7.4:1) | `bg-blue-950/40 text-blue-300 border border-blue-800/50` | Blue-300 on deep blue (~9.0:1) |
| **Neutral / Offline** | `bg-slate-100 text-slate-700 border border-slate-200` | Slate-700 on slate-100 (~7.2:1) | `bg-slate-800/60 text-slate-300 border border-slate-700/60` | Slate-300 on slate-800 (~6.8:1) |

---

### Persistent Frame (Sidebar Invariant)

The sidebar is anchored in dark slate across both themes:
- **Canvas:** `#020617` (`bg-slate-950` / Sidewall).
- **Group Labels:** `text-slate-400` (`#94a3b8`), font-size `0.625rem`, uppercase, tracking `0.05em`.
- **Inactive Nav Items:** `text-slate-400 hover:text-slate-100 hover:bg-slate-900/60`.
- **Active Nav Item:** `text-blue-400 bg-blue-500/10 border-l-2 border-blue-500`.
- **Inverted Action Buttons:** Any white button inside persistent dark panels must use `[data-keep-white]` with dark text `text-slate-900` to prevent white-on-white text inversion.

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
| **Muted** | 400 (Regular), `0.8125rem` (13px) | 1.4 | Normal | `text-slate-500` | `text-slate-300` | Timestamps, secondary IDs, help descriptions. |
| **Mono** | 400 (Regular), `0.8125rem` (13px) | 1.5 | Normal | `text-slate-800` | `text-slate-200` | Telegram user IDs, phone numbers, session strings. |

---

## 4. Elevation, Borders & Transitions

TeleBos avoids dramatic drop shadows in favor of crisp boundaries and purposeful state transitions.

### Border Strategy
- **Light Mode:** 1px hairline border using `border-slate-200` (`#e2e8f0`) on cards, inputs, and dividers. Cards at rest carry `ring-1 ring-slate-900/5` or `border border-slate-200`.
- **Dark Mode:** 1px hairline border using `border-slate-800` (`#1e293b`) or `border-slate-700/60` (`#334155`). Cards do not use drop shadows at rest; separation is delivered via the contrast between base `#0f172a` and card surface `#1e293b`.

### Shadows (State-Triggered Only)
- **Resting Cards:** `shadow-none` (both themes).
- **Interactive Card Hover:**
  - Light Mode: `shadow-md shadow-slate-900/5` + subtle upward transform (`-translate-y-[1px]`).
  - Dark Mode: Surface highlight (`bg-slate-800/80` or `border-slate-600`) without shadow blur.
- **Dropdowns & Popovers:**
  - Light Mode: `shadow-lg shadow-slate-900/10 border border-slate-200 bg-white`.
  - Dark Mode: `shadow-2xl shadow-black/60 border border-slate-800 bg-slate-900`.
- **Modals & Overlays:**
  - Light Mode: Backdrop `bg-black/40 backdrop-blur-sm`, container `bg-white border border-slate-200 shadow-2xl`.
  - Dark Mode: Backdrop `bg-black/75 backdrop-blur-sm`, container `bg-slate-900 border border-slate-800 shadow-2xl`.

### Theme Transition Smoothing
All color-shifting surfaces employ the transition tokens defined in `base.css`:
```css
transition: background-color 0.2s ease-in-out, border-color 0.2s ease-in-out, color 0.2s ease-in-out;
```
This guarantees an instantaneous, flicker-free transition when switching between Light and Dark modes.

---

## 5. Component Specifications (Dual-Theme Implementation)

### 1. Buttons

Standard button height is **2.25rem (36px)** with `rounded-lg` (8px corners) and `text-sm font-medium`.

- **Primary Button:**
  - Fill: `bg-primary` (`#3b82f6`).
  - Text: `text-white` (`#ffffff`).
  - Hover: `hover:bg-primary-hover` (`#2563eb`) or `hover:opacity-90`.
  - Focus: `focus-visible:ring-2 focus-visible:ring-primary/50`.
- **Secondary Button:**
  - Light: `bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200/60`.
  - Dark: `bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700/60`.
- **Outline Button:**
  - Light: `bg-transparent text-slate-800 border border-slate-200 hover:bg-slate-50`.
  - Dark: `bg-transparent text-slate-200 border border-slate-700 hover:bg-slate-800/60`.
- **Ghost Button:**
  - Light: `bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900`.
  - Dark: `bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white`.
- **Destructive Button:**
  - Light: `bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200`.
  - Dark: `bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 border border-rose-800/50`.
- **Disabled State:**
  - Both Themes: `opacity-50 pointer-events-none cursor-not-allowed`.

---

### 2. Cards & Bento Containers

Cards organize telemetry, account lists, and action consoles.

- **Structure:**
  - Corner Radius: `rounded-xl` (12px).
  - Padding: `p-4` (16px) or `p-6` (24px) for major sections.
- **Surfaces:**
  - Light: `bg-white text-slate-900 border border-slate-200 shadow-sm shadow-slate-900/5`.
  - Dark: `bg-slate-900 text-slate-100 border border-slate-800`.
- **Card Header & Title:**
  - Title: `text-base font-semibold text-slate-900 dark:text-slate-100`.
  - Subtitle: `text-sm text-slate-500 dark:text-slate-300`.
- **Card Footer:**
  - Light: `bg-slate-50/60 border-t border-slate-100 px-4 py-3`.
  - Dark: `bg-slate-800/40 border-t border-slate-800 px-4 py-3`.

---

### 3. Form Inputs, Selects & Textareas

Form controls must guarantee high contrast and unambiguous focus states.

- **Geometry:** Height `2.25rem` (36px), padding `px-3 py-2`, `rounded-lg` (8px).
- **Light Theme:**
  - Surface: `bg-white`.
  - Border: `border border-slate-300`.
  - Text: `text-slate-900`.
  - Placeholder: `placeholder:text-slate-500`.
  - Focus: `focus:border-primary focus:ring-2 focus:ring-primary/20`.
- **Dark Theme:**
  - Surface: `bg-slate-950/60` (or `hsl(215 20% 14%)`).
  - Border: `border border-slate-700`.
  - Text: `text-slate-100`.
  - Placeholder: `placeholder:text-slate-400`.
  - Focus: `focus:border-primary-400 focus:ring-2 focus:ring-primary-400/25`.
- **Error State:**
  - Light: `border-rose-500 focus:ring-rose-500/20 text-rose-900`.
  - Dark: `border-rose-500 focus:ring-rose-500/25 text-rose-100`.

---

### 4. Tables & Data Grids

Tables manage high-density account sessions, proxy latency, and broadcast queues.

- **Table Header:**
  - Light: `bg-slate-50 text-slate-700 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider`.
  - Dark: `bg-slate-900/80 text-slate-300 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider`.
- **Data Rows:**
  - Light: `border-b border-slate-100 hover:bg-slate-50/80 text-slate-700`.
  - Dark: `border-b border-slate-800/60 hover:bg-slate-800/50 text-slate-200`.
- **Cell Padding:** `px-4 py-3 text-sm`.

---

### 5. Dialogs, Modals & Sheets

- **Backdrop:**
  - Light: `bg-slate-950/40 backdrop-blur-sm`.
  - Dark: `bg-black/75 backdrop-blur-sm`.
- **Modal Surface:**
  - Light: `bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 text-slate-900`.
  - Dark: `bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100`.
- **Close Button:**
  - Light: `text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5`.
  - Dark: `text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg p-1.5`.

---

### 6. Loading Skeletons & Shimmer States

- **Animation:** `animate-shimmer` with 1.5s ease slide.
- **Light Mode:** Base `bg-slate-100` shimmering to `bg-slate-200/60`.
- **Dark Mode:** Base `bg-slate-800` shimmering to `bg-slate-700/60`.

---

## 6. Low-Contrast Prevention Guardrails

To prevent regression and guarantee crystal-clear legibility across all screens, every UI implementation must adhere to the following 8 Golden Rules:

### Rule 1: The Slate-400 Ban on Light Surfaces
Never author `text-slate-400` or `text-gray-400` for readable labels, metadata, or table entries on a light canvas. Use `text-slate-500` or `text-muted-foreground` (≥ 4.6:1) instead.

### Rule 2: The Slate-500 Ban on Dark Surfaces
Never author raw `text-slate-500` on dark cards. It drops contrast to 2.8:1 and fails WCAG AA. Always map through `text-muted-foreground` or use `dark:text-slate-300` (≥ 6.5:1).

### Rule 3: The Primary-Text Accent Rule
Never use mid-blue `#3b82f6` (`text-primary`) as unstyled text on dark backgrounds. For links, breadcrumbs, or text buttons on dark surfaces, use `text-blue-400` (`#60a5fa`) or `text-primary-300` (`#93c5fd`). Reserve filled `--primary` for solid buttons and badges with white text.

### Rule 4: Explicit Status Badge Text Contrast
Status chips must never combine light pastel backgrounds with pale text in light mode, nor dark backgrounds with dark text in dark mode. Always enforce:
- **Light:** Tinted-50 fill + 800-step text + 200-step border.
- **Dark:** Tinted-950/40 fill + 300/400-step text + 800/50-step border.

### Rule 5: Preserved Dark Surface Text Invariant (`[data-keep-white]`)
When an inverted white control resides on a permanent dark surface (such as the sidebar or Telegram chat bubble), apply `[data-keep-white]` and ensure the label retains dark ink `text-slate-900`. Never allow theme remapping to produce white text on a white button.

### Rule 6: Form Placeholder Standard
Input placeholders must maintain ≥ 4.5:1 contrast against their input fill. Use `placeholder:text-slate-500` in light mode and `placeholder:text-slate-400` in dark mode. Default browser placeholders that appear washed out are strictly prohibited.

### Rule 7: Hairline Boundary Verification
Cards and form fields must never bleed into the page canvas. Always verify that:
- Light cards carry a visible 1px `border-slate-200` against `#ffffff` or `#f8fafc`.
- Dark cards carry a visible 1px `border-slate-800` or `border-slate-700/60` against `#0f172a`.

### Rule 8: Smooth Theme Transitions
Never use abrupt color flips. Ensure all dynamic surfaces inherit `transition: background-color 0.2s, border-color 0.2s, color 0.2s` from `base.css` to deliver silky, flicker-free transitions.

---

## 7. Do's and Don'ts Matrix

### Do:
- **Do** test every screen in both Light and Dark modes before finalizing changes.
- **Do** use semantic tokens (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`) instead of hardcoded hex colors.
- **Do** maintain the permanent dark frame on the sidebar (`#020617`) in both themes.
- **Do** ensure normal body text meets ≥ 4.5:1 contrast and large headings meet ≥ 3.0:1 in both themes.
- **Do** use `text-wrap: balance` on section headings and `text-wrap: pretty` on long descriptions.
- **Do** use visible focus rings (`focus-visible:ring-2 focus-visible:ring-primary/50`) for full keyboard navigation.
- **Do** preserve fast, subtle micro-interactions (150–200ms) with `ease-out`.

### Don't:
- **Don't** use cream, sand, beige, or warm-tinted backgrounds (violates the serious workbench identity).
- **Don't** use decorative gradient text (`background-clip: text` with gradient).
- **Don't** use glassmorphism or heavy backdrop-blur surfaces inside dashboard cards.
- **Don't** use `text-slate-400` on white or `text-slate-500` on dark card surfaces.
- **Don't** nest cards inside cards (creates cluttered visual noise).
- **Don't** apply blurry drop shadows to resting cards (depth is communicated through tonal layering and hairline borders).
- **Don't** invert the sidebar canvas to white in Light mode — the sidebar is a persistent dark anchor.
- **Don't** invent random secondary accent colors (purple, pink, amber, teal) for layout decoration. Blue is the single primary accent.
