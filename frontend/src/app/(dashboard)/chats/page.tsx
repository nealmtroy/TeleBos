"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ChatsContent } from "@/components/chat/ChatsContent";

export default function ChatsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <ChatsContent />
    </Suspense>
  );
}
