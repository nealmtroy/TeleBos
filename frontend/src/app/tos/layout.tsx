import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "TeleBos terms of service — the rules and guidelines for using TeleBos.",
  robots: "index, follow",
};

export default function TosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
