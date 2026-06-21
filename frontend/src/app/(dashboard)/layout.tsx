import type { Metadata } from "next";
import DashboardShell from "./shell";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s | TeleBos",
  },
  robots: "noindex, nofollow",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
