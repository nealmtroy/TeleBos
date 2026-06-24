---
name: TeleBos
description: Multi-account Telegram manager for power users
colors:
  primary: "#3b82f6"
  primary-hover: "#2563eb"
  primary-foreground: "#ffffff"
  background: "#ffffff"
  foreground: "#0f172a"
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
  dark-card: "#0f172a"
  dark-secondary: "#1e293b"
  dark-muted: "#1e293b"
  dark-muted-foreground: "#94a3b8"
  dark-accent: "#1e293b"
  dark-border: "#1e293b"
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
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1rem"
    border: "1px solid {colors.border}"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
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
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
    border: "1px solid {colors.input}"
    height: "2.25rem"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "0 0.5rem"
    height: "1.25rem"
---

# Design System: TeleBos

## 1. Overview

**Creative North Star: "The Workbench"**

TeleBos is a precision instrument for Telegram power users — a tool that gets out of the way and lets them work. The interface is organized like a well-stocked workbench: every tool is within reach, arranged by task (accounts, broadcast, automation), and built for sustained sessions of high-throughput work.

The aesthetic is **serious and professional**, not decorative. Dark slate surfaces anchor the identity — the sidebar is a deep, confident presence that frames the workspace. The blue accent is used surgically: active states, interactive elements, and data highlights. It never overwhelms. Cards carry thin ring borders instead of shadows — depth is communicated through tonal layering, not elevation. Light mode exists as a respectful accommodation for users who prefer it, but the soul of the product lives in dark mode.

This system explicitly rejects the AI-tool aesthetic: no cream backgrounds, no gradient text, no glassmorphism, no numbered-section markers, no generic SaaS card grids. Every pixel earns its keep by enabling a workflow.

**Key Characteristics:**
- Dark mode first, light mode as equal-quality accommodation
- Flat/tonal layering: depth via color, not shadows
- Surgical blue accent, used on ≤15% of any screen
- Dense but structured: readable scan paths through complex data
- Stateful: every interaction has a clear, immediate response
- Reduced-motion friendly: animations serve state transitions, not decoration

## 2. Colors

The palette is restrained by design — one blue primary on a neutral slate-and-white scaffold. The range is deliberately narrow; constraints produce confidence.

### Primary
- **Tool Blue** (#3b82f6 / oklch(55% 0.22 262)): The single accent color. Used for interactive elements — buttons, active nav items, links, focus rings. Never used for decorative surfaces, backgrounds, or large areas. Its rarity is the point.

### Neutral (Light)
- **White** (#ffffff / oklch(100% 0 0)): Canvas background for the main content area and cards.
- **Slate Ink** (#0f172a / oklch(13% 0.03 250)): Primary body text. Also used for headings and key labels.
- **Slate Mist** (#f1f5f9 / oklch(97% 0.005 250)): Secondary surface — muted backgrounds, card footers, subtle fills.
- **Muted Slate** (#64748b / oklch(55% 0.02 250)): Secondary text — labels, descriptions, placeholders, metadata.
- **Slate Border** (#e2e8f0 / oklch(93% 0.005 250)): Card rings, input borders, dividers.
- **Alert Red** (#ef4444 / oklch(63% 0.24 25)): Destructive actions, error states, danger badges.

### Neutral (Dark)
- **Deep Slate** (#0f172a / oklch(13% 0.03 250)): Dark canvas background. The surface the product lives on.
- **Surface Slate** (#1e293b / oklch(26% 0.03 250)): Dark secondary surface — card backgrounds, sidebar surfaces, muted areas.
- **Light Slate Ink** (#f8fafc / oklch(98% 0 250)): Body text on dark surfaces.
- **Dim Slate** (#94a3b8 / oklch(66% 0.02 250)): Muted text on dark — secondary labels, metadata, placeholder text.
- **Dark Border** (#1e293b / oklch(26% 0.03 250)): Dividers and borders on dark backgrounds.
- **Dark Ring Blue** (#60a5fa / oklch(67% 0.17 262)): Focus rings on dark surfaces.

### Sidebar
- **Sidewall** (#020617 / oklch(6% 0.025 250)): The sidebar canvas. Nearly black, establishes frame weight.
- **Sidewall Surface** (#0f172a / oklch(13% 0.03 250)): Elevated surfaces within the sidebar (dropdowns, tooltips).
- **Sidewall Border** (#0f172a / oklch(13% 0.03 250)): Sidebar divisions.
- **Sidewall Text** (#94a3b8 / oklch(66% 0.02 250)): Inactive nav items, labels in the sidebar.
- **Sidewall Active** (#3b82f6 / oklch(55% 0.22 262)): Active nav item text and indicator.
- **Sidewall Active Bg** (hsla(221 83% 53% / 0.1)): Active nav item background tint (rgba overlay pattern).

### Named Rules
**The One Voice Rule.** The blue primary is used on ≤15% of any given screen. Its rarity is what gives it meaning. When everything is blue, nothing is active.

**The No-Tint Rule.** Neutral surfaces are neutral. No warm-tinted creams, no cool-tinted greys "for depth." Chroma in neutrals stays ≤0.005. The accent carries all the color energy.

## 3. Typography

**Display & Body Font:** Inter (variable, with `ui-sans-serif, system-ui, sans-serif` fallback)
**Label/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

Inter was chosen for its large x-height and tight letterforms — it reads well at small sizes (dense tables, logs, status text) and has the authority to anchor headlines. One family for everything eliminates pairing risk and keeps the system minimal.

### Hierarchy
- **Display** (ExtraBold 800, `clamp(2.25rem, 5vw, 3.5rem)`, line-height 1.1, tracking -0.03em): Landing page hero headlines only. Never used inside the dashboard.
- **Headline** (Bold 700, `clamp(1.5rem, 3vw, 2rem)`, line-height 1.2, tracking -0.02em): Page titles, section headings in the dashboard.
- **Title** (Semibold 600, 1rem/16px, line-height 1.4, tracking -0.01em): Card titles, modal headers, list item primary labels.
- **Body** (Regular 400, 0.875rem/14px, line-height 1.6): Default text — paragraphs, descriptions, table cells, log content. Cap line length at 65–75ch.
- **Label** (Medium 500, 0.8125rem/13px, line-height 1.25): Form labels, navigation items, badges, small metadata.
- **Mono** (Regular 400, 0.8125rem/13px, line-height 1.5): Code blocks, session strings, numeric IDs, technical data display.

### Named Rules
**The Single-Family Rule.** Inter for everything. No second font family, no "display font" pairing. The hierarchy is expressed through weight, size, and color alone — not a font swap. This enforces the tool-like precision of the brand.

## 4. Elevation

TeleBos uses **tonal layering**, not shadows, to communicate depth. The dark-mode sidebar is the deepest surface (slate-950), with the content area a step above (slate-900 dark / white light). Cards are differentiated from their container by a subtle ring border (`ring-1 ring-foreground/10`) rather than a drop shadow.

Dialogues, dropdowns, and floating panels use a slightly lighter surface color in dark mode, or a thin shadow in light mode. The rule: if it floats, it gets either a tonal lift or a `shadow-lg` — never both.

### Shadow Vocabulary
- **Floating panel** (light: `0 10px 15px -3px rgba(0,0,0,0.1)`, dark: none — tonal lift only): Dropdowns, popovers, menus.
- **Modal** (light: `0 20px 25px -5px rgba(0,0,0,0.15)`, dark: `0 25px 50px rgba(0,0,0,0.5)`): Dialog overlays.
- **Hover lift** (light: `0 4px 12px rgba(0,0,0,0.08)`, dark: none): Interactive card hover states.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, focus, open). A card at rest should look like it's printed on the page, not hovering above it.

## 5. Components

### Buttons

Buttons are the most interactive element in the system. They use a compact 2.25rem (36px) default height, rounded-lg corners, and clear hover/focus states.

- **Shape:** Rounded-lg (8px). Compact 2.25rem default height.
- **Primary** (`bg-primary text-primary-foreground`): Tool Blue fill, white text. Used for the single primary action on a screen. Hover: 80% opacity (not a color shift). Focus: 3px ring at 50% opacity. Active: pressed down 1px.
- **Secondary** (`bg-secondary text-secondary-foreground`): Slate Mist fill in light, Surface Slate in dark. Used for secondary actions alongside a primary button.
- **Outline** (`border-border bg-background hover:bg-muted`): Transparent fill with border. Neutral, for non-critical actions.
- **Ghost** (`hover:bg-muted hover:text-foreground`): Borderless, minimal. For toolbar items, table row actions, dismiss buttons.
- **Destructive** (`bg-destructive/10 text-destructive`): Tinted red. Used only for irreversible destructive actions (delete account, terminate session, cancel running job).
- **Link** (`text-primary underline-offset-4 hover:underline`): Text-only action, styled as a link.
- **Disabled:** `opacity-50`, no pointer events. No hover state. The disabled button communicates "this action is unavailable" without removing it.

### Cards

Cards are the primary content container in the dashboard. They feel printed, not floating.

- **Corner Style:** Rounded-xl (12px).
- **Background:** White (light) / Deep Slate (dark).
- **Border Strategy:** `ring-1 ring-foreground/10` in both themes — a thin, subtle outline that defines the card boundary without casting a shadow.
- **Internal Padding:** 1rem (16px) default, 0.75rem on `size="sm"` variant.
- **Footer:** Tinted background (slate-mist / surface-slate), separated by a hairline border. Contains secondary actions or metadata.
- **States:** Hover on interactive cards: lift via `shadow-lg shadow-primary-50` in light, subtle bg shift in dark. Never nested.

### Badges

Small, compact status indicators. Fully rounded (`rounded-full`), 1.25rem (20px) height.

- **Default:** Tool Blue fill, white text. Active status, counts.
- **Secondary:** Slate Mist fill. Neutral metadata.
- **Destructive:** Tinted red (`bg-destructive/10 text-destructive`). Error states, bans, failures.
- **Outline:** Border only, no fill. Subtle labels.
- **Ghost:** No visible container. Hover-reveal variant for inline tags.

### Inputs / Fields

Form controls use a clean bordered style consistent with the flat aesthetic.

- **Style:** 1px solid border (`border-input`), rounded-lg (8px), 2.25rem default height.
- **Background:** White (light) / transparent (dark, with dark-border).
- **Focus:** Blue ring at 50% opacity (`focus-visible:ring-3 focus-visible:ring-ring/50`). Never a border color shift alone — the ring is mandatory.
- **Placeholder:** Muted Slate / Dim Slate, with 4.5:1 contrast against background (never the default low-contrast browser grey).
- **Error:** Red border + red focus ring (`aria-invalid:border-destructive aria-invalid:ring-destructive/20`).
- **Disabled:** Reduced opacity, no interactive states.

### Navigation

The sidebar is the primary navigation. It's a persistent dark panel on the left.

- **Style:** Nearly-black canvas (#020617), with group-section labels in tiny uppercase tracking-wider. Segmented by labeled groups (MAIN MENU, AUTOMATION, BILLING, SUPPORT).
- **Link Default:** Slate-400 text, no background. Subdued but readable.
- **Link Active:** Blue text (`text-primary-400`), blue left border indicator (2px), subtle blue bg tint at 10%.
- **Collapsed Mode:** Icon-only at 72px width. Active items show a thin blue left indicator. Hover reveals tooltip labels.
- **Mobile:** Full overlay with semi-transparent backdrop. Close button in header.
- **Submenu:** Collapsible accordion for grouped items (Broadcast, Orders, Admin). Blue left border indent line.
- **Profile Section:** Bottom of sidebar — user avatar (gradient initials), name, email, wallet balance. Click opens a floating popover with settings and logout.

### Skeleton / Loading

- **Pattern:** Shimmer animation (`shimmer: bg-position slide, 1.5s ease-in-out infinite`). Used for initial page load and async content transitions.
- **Shape:** Rounded blocks matching the content silhouette. Cards get card-shaped skeletons; text gets line-height-matched rows.

## 6. Do's and Don'ts

### Do:
- **Do** use Tool Blue sparingly — ≤15% of any given screen. Let slate and white do the heavy lifting.
- **Do** use tonal layering for depth instead of shadows. Flat surfaces communicate "solid tool" more effectively than lifted cards.
- **Do** use `text-wrap: balance` on h1–h3 and `text-wrap: pretty` on long body text.
- **Do** use Inter weight and size as the sole typographic hierarchy. No font swaps, no decorative display type.
- **Do** show clear loading, empty, error, and success states for every async operation. Power users need certainty.
- **Do** respect `prefers-reduced-motion` — fade transitions over slide/choreography.
- **Do** keep body text contrast ≥4.5:1 and placeholder text at the same standard.

### Don't:
- **Don't** use cream, sand, beige, or "warm neutral" backgrounds — this is the defining AI-aesthetic tell.
- **Don't** use gradient text (`background-clip: text` with gradient) — it's decorative and never meaningful.
- **Don't** use glassmorphism, backdrop-blur surfaces, or frosted-glass effects.
- **Don't** use tiny uppercase tracked "eyebrow" labels above section headings.
- **Don't** use numbered section markers (01 / 02 / 03) as decorative scaffolding.
- **Don't** use "hero-metric" layouts (big number, small label, gradient accent) — the SaaS cliché.
- **Don't** use side-stripe borders greater than 1px on cards, list items, or callouts.
- **Don't** nest cards. A card inside a card is always wrong.
- **Don't** use purple, pink, or teal accents. The single blue primary is the only accent.
- **Don't** apply shadows to cards at rest. Flat by default.
- **Don't** invent secondary colors, tertiary colors, or color ramps the system doesn't have.
- **Don't** use bounce or elastic animations. Ease-out-quart or ease-out-expo only.
- **Don't** reference Telegram's own UI aesthetic — TeleBos is its own product.
