import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_URL || "https://telebos.app";
  const cleanUrl = siteUrl.replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/help", "/privacy-policy", "/terms-of-service"],
      disallow: [
        "/login",
        "/register",
        "/dashboard",
        "/accounts",
        "/accounts/",
        "/chats",
        "/broadcast",
        "/broadcast/",
        "/settings",
        "/auto-reply",
        "/invite",
        "/api/",
        "/ws/",
      ],
    },
    sitemap: `${cleanUrl}/sitemap.xml`,
  };
}
