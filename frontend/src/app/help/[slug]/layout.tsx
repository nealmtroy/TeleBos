import type { Metadata } from "next";

export async function generateStaticParams() {
  // Return an empty array — params will be generated at runtime
  return [];
}

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
