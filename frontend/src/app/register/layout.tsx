import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  robots: "noindex, nofollow",
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
