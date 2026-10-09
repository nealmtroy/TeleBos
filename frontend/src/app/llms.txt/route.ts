export const dynamic = "force-dynamic";

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_URL || "https://telebos.app";
  const cleanUrl = siteUrl.replace(/\/$/, "");

  const content = `# TeleBos

> Multi-account Telegram management platform with automated anti-flood broadcasting, proxy assignment, auto-responder workflows, and real-time WebSocket monitoring.

TeleBos enables businesses, community managers, and power users to operate multiple Telegram accounts concurrently with automated risk mitigation. It features OTP and session-string account authentication, real-time message feeds, multi-cycle group and channel broadcasting with configurable jitter and anti-flood delays, automated keyword triggers, and bulk audience engagement tools.

## Core Documentation

- [API Documentation](${cleanUrl}/api/docs): Interactive OpenAPI Swagger documentation for all REST endpoints and WebSocket protocols.
- [OpenAPI Specification](${cleanUrl}/api/openapi.json): Raw OpenAPI 3.1 JSON schema describing authentication, broadcast jobs, account sessions, and webhook contracts.
- [Help Center](${cleanUrl}/help): Comprehensive knowledge base, guides, and feature walk-throughs for TeleBos.

## Guides & Tutorials

- [Getting Started](${cleanUrl}/help/getting-started): Account onboarding, authentication workflows, and system setup overview.
- [Account Management](${cleanUrl}/help/account-management): Adding Telegram accounts via phone OTP or session string upload, proxy allocation, and session security.
- [Broadcasting & Anti-Flood](${cleanUrl}/help/broadcasting): Setting up multi-target broadcasts, random delay intervals, batch cycles, and anti-flood protection.
- [Auto-Reply Automation](${cleanUrl}/help/auto-reply): Configuring real-time automated responders, keyword matching, and reply deduplication.
- [Member Invite Tools](${cleanUrl}/help/member-invite): Bulk member invite automation with safety intervals and rate limits.
- [API Integration Guide](${cleanUrl}/help/api): Developer documentation for utilizing TeleBos external REST and webhook APIs.
- [Troubleshooting & FAQ](${cleanUrl}/help/troubleshooting): Resolving common Telegram API errors, session expiration, and proxy timeouts.
- [Pro Tips & Best Practices](${cleanUrl}/help/pro-tips): Optimization tips for maintaining Telegram account health and avoiding spam bans.

## Optional

- [Pricing & Plans](${cleanUrl}/pricing): Subscription pricing tiers, account limits, and SMM booster services.
- [Privacy Policy](${cleanUrl}/privacy-policy): Data privacy policies, encryption guarantees, and Telegram session handling security.
- [Terms of Service](${cleanUrl}/terms-of-service): Platform acceptable use policy and terms of service.
- [Official Telegram Channel](https://t.me/telebos_official): Announcements, feature updates, and release changelogs.
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
