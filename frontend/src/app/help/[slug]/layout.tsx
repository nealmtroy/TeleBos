import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: "index, follow",
};

export default function HelpDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
