# Product

## Users

Telegram power users managing multiple accounts for broadcast, automation, and account management. They are technically literate, comfortable with complex tooling, and likely running parallel operations across dozens of accounts. The primary context is "getting work done" — sending messages to many groups at scale, monitoring delivery, and orchestrating automated responses. These are not casual Telegram users; they run this tool as part of their daily workflow.

## Product Purpose

TeleBos is a multi-account Telegram manager that lets power users add unlimited Telegram accounts, manage profiles and privacy, view chats in real time, and broadcast messages to groups/channels with configurable delays and looping. It replaces juggling multiple Telegram clients, browser sessions, or custom scripts — giving users a single control surface for all their Telegram activity. Success means reliable, uninterrupted operation at scale.

## Brand Personality

Serious, confident, precise. Three words: **powerful, professional, precise.**

The tone is direct and unfussy — a tool that respects the user's time and expertise. No gimmicks, no playful illustrations, no decorative fluff. Every pixel earns its place by enabling the user's workflow. Think Linear's clarity, Vercel's confidence, Sentry's data-density — interfaces that feel engineered rather than decorated.

The emotional goal is *trust through reliability*. The interface should feel like it's built by people who understand the stakes of mass communication: that a failed broadcast or a misconfigured setting has real consequences. The UI communicates certainty — clear states, immediate feedback, no ambiguity.

## Anti-references

TeleBos must explicitly avoid the "AI-generated" aesthetic family:

- No cream / sand / beige backgrounds or "warm neutral" tints
- No gradient text (`background-clip: text` with gradient)
- No glassmorphism or decorative blur surfaces
- No tiny uppercase tracked "eyebrow" labels above every section heading
- No numbered section markers (01 / 02 / 03) as decorative scaffolding
- No generic blue-and-white SaaS with rounded card grids (old HubSpot, Bootstrap admin templates)
- No "hero-metric" layout (big number, small label, gradient accent — the SaaS cliché)
- No cartoonish illustrations, bubbly buttons, or gamified UI elements
- The dashboard interface should not mimic Telegram's own UI — TeleBos is its own product (with the explicit exception of the `/chats` page, which intentionally mimics Telegram Web K to provide a native, high-performance chatting experience decoupled from the global TeleBos shell).

## Design Principles

1. **Clarity over cleverness.** Every state, action, and outcome is unambiguous. Loading, empty, error, success — each has a clear visual language. The user never wonders "did it work?"

2. **Data density with hierarchy.** Power users need information density, but density without structure is noise. Use typography, spacing, and color to create readable scan paths through complex data (tables, logs, progress states).

3. **Confidence through predictability.** Actions have predictable outcomes. Buttons don't wander. Navigation doesn't surprise. The system responds immediately to user input, even if the async operation takes time. Skeletons, progress bars, and status indicators follow consistent patterns.

4. **Tool, not toy.** Zero decorative flourishes. Animation serves a functional purpose (state transitions, progress indication, spatial awareness). If removing it improves clarity, remove it.

5. **Dark mode as the default expression.** The dark side of the theme is the primary identity — it communicates the "serious tool" personality. Light mode is a respectful accommodation, not the canonical look.

## Accessibility & Inclusion

Standard WCAG 2.1 AA compliance:
- Body text contrast ≥ 4.5:1 against its background; large text ≥ 3:1
- Keyboard navigable throughout
- `prefers-reduced-motion` respected — all animations degrade gracefully to crossfade or instant transitions
- Interactive elements have visible focus indicators
- Color is never the sole differentiator for state or status
