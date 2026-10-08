import type { Metadata } from "next";
import { SupportChatWidget } from "@/components/help/support-chat-widget";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Help Center",
    template: "%s | TeleBos Help",
  },
  description: "TeleBos help center — guides and tutorials for managing multiple Telegram accounts, broadcasting, auto-reply, and more.",
  robots: "index, follow",
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <SupportChatWidget />
    </>
  );
}
