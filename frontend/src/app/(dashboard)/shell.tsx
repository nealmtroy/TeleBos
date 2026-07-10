"use client";

import { useAuthStore } from "@/store/auth-store";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import AnnouncementBanner from "@/components/layout/announcement-banner";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const router = useRouter();
  const pathname = usePathname();
  const isChatsPage = pathname?.startsWith("/chats");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <AnnouncementBanner />
        <main
          className={cn(
            "flex-1 min-w-0",
            isChatsPage
              ? "h-full w-full overflow-hidden p-0"
              : "overflow-y-auto p-4 md:p-6 pb-14"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
