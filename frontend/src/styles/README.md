# TeleBos Modular CSS Architecture

This directory organizes the global style system for the TeleBos frontend into modular, single-responsibility stylesheets instead of a monolithic `globals.css`.

## Directory Structure

```text
src/styles/
├── tokens.css        # CSS custom properties & HSL theme tokens (:root & .dark)
├── base.css          # CSS resets, HTML element defaults, and theme transition smoothing
├── dark-bridge.css   # Dark mode utility mapping bridge for light-canvas Tailwind classes
├── animations.css    # Radix UI, Dialog, Sheet keyframes and data-state transitions
├── public-theme.css  # Landing page theme, editorial typography, and 3D kinetic sculpture
├── utilities.css     # Custom utility helpers (e.g., .no-scrollbar)
├── index.css         # Barrel index stylesheet
└── README.md         # Documentation and architecture guidelines
```

---

## File Responsibilities

### 1. `tokens.css`
- Defines core theme variables in HSL format for shadcn/ui and custom components.
- Sets background, foreground, primary, secondary, muted, accent, destructive, card, popover, border, input, and ring variables.
- Configured for both light mode (`:root`) and dark mode (`.dark`).

### 2. `base.css`
- Applies universal border variables (`* { @apply border-border; }`).
- Sets body background and font smoothing.
- Configures gentle theme transition smoothing on background and border colors.

### 3. `dark-bridge.css`
- Contains the TeleBos Dark Mode Bridge (`@layer utilities`).
- Bridges Tailwind utilities authored against a light canvas (e.g. `bg-white`, `text-slate-900`) to the dark surface and text ladders.
- Preserves intentional dark surfaces (such as the sidebar and dashboard hero).

### 4. `animations.css`
- Encapsulates keyframes (`fadeIn`, `fadeOut`, `slideInFromTop`, `slideInFromRight`, etc.).
- Defines Radix UI `data-[state=open]` and `data-[state=closed]` transition classes.

### 5. `public-theme.css`
- Encapsulates styles for public marketing pages (`/`, `/privacy-policy`, `/terms-of-service`).
- Configures `--public-*` custom tokens, serif/mono editorial typography, and 3D kinetic cube sculpture animations.
- Handles responsive scaling and `prefers-reduced-motion` compliance.

### 6. `utilities.css`
- Holds specialized utility classes like `.no-scrollbar` that extend Tailwind's utility layer.

---

## How It Is Imported

[`src/app/globals.css`](../app/globals.css) acts as the lean master orchestrator that loads Tailwind and the modular stylesheets in the correct layer order:

```css
@import "tailwindcss/base";
@import "../styles/tokens.css";
@import "../styles/base.css";

@import "tailwindcss/components";

@import "tailwindcss/utilities";
@import "../styles/dark-bridge.css";
@import "../styles/animations.css";
@import "../styles/public-theme.css";
@import "../styles/utilities.css";
```

## Guidelines for New Styles
1. **Never add raw styling blocks directly to `globals.css`.**
2. For new theme variables, add them to `tokens.css`.
3. For reusable modal or UI component animations, place them in `animations.css`.
4. Isolated feature-specific styles (such as Telegram Web K emulator styles) should stay in scoped CSS files within their feature directory (e.g., [`src/components/chat/chat.css`](../components/chat/chat.css)).
