import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getRequestLocale, getRequestPathname } from "@/lib/i18n";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import Script from "next/script";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});
const publicMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-public-mono",
});
// The public surface declares font-family: var(--font-public-sans), but that
// variable was never defined, so every sans face on the landing page fell back
// to the OS default and changed per device. This wires it to a real font:
// warm and geometric, which suits the paper palette and is the same face used
// for the display headings, so the whole public surface is one typeface.
const publicSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

const siteUrl = process.env.NEXT_PUBLIC_URL || "https://telebos.app";
const gaId = process.env.NEXT_PUBLIC_GA_ID || "G-SR0FJEE8YR";

export async function generateMetadata(): Promise<Metadata> {
  const requestLocale = getRequestLocale() ?? "en";
  const requestPathname = getRequestPathname() ?? "/";
  const isId = requestLocale === "id" || requestPathname.startsWith("/id");

  // Determine unlocalized path to construct path-accurate canonical and alternates
  const unlocalizedPath = isId
    ? requestPathname === "/id" || requestPathname === "/id/"
      ? "/"
      : requestPathname.replace(/^\/id(\/|$)/, "/")
    : requestPathname;

  const cleanPath = unlocalizedPath === "/" ? "" : unlocalizedPath.replace(/\/$/, "");
  const canonicalUrl = isId ? `${siteUrl}/id${cleanPath}` : `${siteUrl}${cleanPath}`;
  const enUrl = `${siteUrl}${cleanPath}`;
  const idUrl = `${siteUrl}/id${cleanPath}`;

  const title = isId
    ? "TeleBos — Kelola Banyak Akun Telegram & Bot Otomasi"
    : "TeleBos — Multi-Account Telegram Manager";

  const description = isId
    ? "Aplikasi web kelola banyak akun Telegram tanpa batas. Broadcast grup & channel anti-banned, auto-reply otomatis, member inviter, dan auto-join dalam satu dashboard."
    : "TeleBos is a powerful multi-account Telegram manager web app. Manage unlimited Telegram accounts, broadcast messages to groups/channels, auto-reply, and monitor chats in real time.";

  const keywords = isId
    ? [
        "kelola akun telegram",
        "multi akun telegram",
        "broadcast telegram",
        "auto reply telegram",
        "bot telegram indonesia",
        "undang member telegram",
        "auto join grup telegram",
        "TeleBos",
      ]
    : [
        "Telegram manager",
        "multi-account Telegram",
        "Telegram broadcast",
        "Telegram auto-reply",
        "Telegram bulk messenger",
        "Telegram account manager",
        "TeleBos",
      ];

  return {
    title: {
      default: title,
      template: "%s | TeleBos",
    },
    description,
    keywords,
    authors: [{ name: "TeleBos" }],
    creator: "TeleBos",
    publisher: "TeleBos",
    metadataBase: new URL(siteUrl),
    icons: {
      icon: [
        { url: "/website_icon.svg", type: "image/svg+xml" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      ],
      apple: [
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
      other: [
        {
          rel: "alternate icon",
          url: "/favicon.ico",
          type: "image/x-icon",
        },
      ],
    },
    openGraph: {
      type: "website",
      locale: isId ? "id_ID" : "en_US",
      siteName: "TeleBos",
      title,
      description,
      url: canonicalUrl,
      images: [
        {
          url: "/t_logo_2x.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/t_logo_2x.png"],
      creator: "@telebos",
    },
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: enUrl,
        id: idUrl,
        "x-default": enUrl,
      },
    },
    category: "technology",
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved once here so the <html lang> attribute and the inline script
  // below can never disagree about what the server rendered.
  const requestLocale = getRequestLocale();

  return (
    <html
      lang={requestLocale ?? "en"}
      suppressHydrationWarning
      className={`${inter.variable} ${publicSans.variable} ${publicMono.variable}`}
    >
      <head>
        {/* Hydration parity: publish the negotiated locale so the i18n store's
            initial state matches the markup React is about to hydrate. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__TELEBOS_LOCALE__=${JSON.stringify(requestLocale ?? "en")};`,
          }}
        />
        {/* Anti-FOUC: resolve dark/light theme before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('telebos_theme');var isDark=t==='dark'||(!t&&true)||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(isDark){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}}catch(e){}})();`,
          }}
        />
        {/* Content-Security-Policy — defense in depth.
             Note: frame-ancestors and X-Frame-Options only work in HTTP headers
             (set by the backend SecurityHeadersMiddleware). We include the
             WebSocket/API origin in connect-src so direct connections to the
             backend work in development (Next.js proxy also serves same-origin).
             In production, set NEXT_PUBLIC_WS_URL to the production backend URL.
             Default: ws://localhost:8000
          */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://www.googletagmanager.com${process.env.NODE_ENV === 'development' ? ' http://localhost:8400' : ''}; worker-src 'self' blob:; child-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://api.qrserver.com https://paymenku.com https://*.paymenku.com https://*.google-analytics.com https://*.googletagmanager.com ${(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000').replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')}; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com ${(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000').replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')} ws: wss:${process.env.NODE_ENV === 'development' ? ' ws://localhost:8400 http://localhost:8400' : ''}; base-uri 'self'; form-action 'self'`}
        />
        <link rel="describedby" href="/llms.txt" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "TeleBos",
              url: (requestLocale === "id" ? `${siteUrl}/id` : siteUrl),
              applicationCategory: "BusinessApplication",
              operatingSystem: "All",
              inLanguage: requestLocale === "id" ? "id-ID" : "en-US",
              description:
                requestLocale === "id"
                  ? "Aplikasi web kelola banyak akun Telegram tanpa batas. Broadcast grup & channel anti-banned, auto-reply otomatis, member inviter, dan auto-join dalam satu dashboard."
                  : "TeleBos is a powerful multi-account Telegram manager web app. Manage unlimited Telegram accounts, broadcast messages to groups/channels, auto-reply, and monitor chats in real time.",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "IDR",
              },
            }),
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${publicMono.variable} ${publicSans.variable} ${inter.className} font-sans antialiased`}
        suppressHydrationWarning
      >
        <GoogleAnalytics gaId={gaId} />
        <Providers>{children}</Providers>
        {/* impeccable-live-start */}
        {process.env.NODE_ENV === 'development' && (
          <Script src="http://localhost:8400/live.js" strategy="lazyOnload" />
        )}
        {/* impeccable-live-end */}
      </body>
    </html>
  );
}
