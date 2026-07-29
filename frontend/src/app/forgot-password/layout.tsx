import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password",
  robots: "noindex, nofollow",
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
