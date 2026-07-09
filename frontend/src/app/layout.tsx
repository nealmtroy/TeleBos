import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const siteUrl = process.env.NEXT_PUBLIC_URL || "https://telebos.app";

export const metadata: Metadata = {
  title: {
    default: "TeleBos — Multi-Account Telegram Manager",
    template: "%s | TeleBos",
  },
  description:
    "TeleBos is a powerful multi-account Telegram manager web app. Manage unlimited Telegram accounts, broadcast messages to groups/channels, auto-reply, and monitor chats in real time.",
  keywords: [
    "Telegram manager",
    "multi-account Telegram",
    "Telegram broadcast",
    "Telegram auto-reply",
    "Telegram bulk messenger",
    "Telegram account manager",
    "TeleBos",
  ],
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
    locale: "en_US",
    siteName: "TeleBos",
    title: "TeleBos — Multi-Account Telegram Manager",
    description: "Fast. Secure. Powerful.",
    url: siteUrl,
    images: [
      {
        url: "/t_logo_2x.png",
        width: 1200,
        height: 630,
        alt: "TeleBos — Multi-Account Telegram Manager",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TeleBos — Multi-Account Telegram Manager",
    description: "Fast. Secure. Powerful.",
    images: ["/t_logo_2x.png"],
    creator: "@telebos",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: siteUrl,
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
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
          content={`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com${process.env.NODE_ENV === 'development' ? ' http://localhost:8400' : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://api.qrserver.com ${(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000').replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')}; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com ${(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000').replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')} ws: wss:${process.env.NODE_ENV === 'development' ? ' ws://localhost:8400 http://localhost:8400' : ''}; base-uri 'self'; form-action 'self'`}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        {/* impeccable-live-start */}
        {process.env.NODE_ENV === 'development' && (
          <script src="http://localhost:8400/live.js"></script>
        )}
        {/* impeccable-live-end */}
      </body>
    </html>
  );
}
