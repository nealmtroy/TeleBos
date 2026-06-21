"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useAdminRedeemLogs } from "@/hooks/use-admin-redeem";
import {
  Shield, AlertCircle, ClipboardList, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

export default function AdminRedeemLogsPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="font-semibold text-gray-900 mb-1">Access Denied</h3>
        <p className="text-sm text-gray-500">Only owners can access the admin panel.</p>
      </div>
    );
  }

  return <RedeemLogsContent />;
}

function RedeemLogsContent() {
  const _ = useT();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAdminRedeemLogs(page, PAGE_SIZE);
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{_("adminRedeem.logs")}</h1>
        <p className="text-gray-500 mt-1">{_("adminRedeem.desc")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load redemption logs</p>
        </div>
      ) : !data?.logs.length ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">{_("adminRedeem.noLogs")}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">{_("adminRedeem.code")}</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">{_("adminRedeem.user")}</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">{_("adminRedeem.detail")}</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">{_("adminRedeem.redeemedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded font-semibold">{log.code}</code>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{log.user_email}</td>
                    <td className="py-3 px-4 text-center">
                      {log.detail ? (
                        (() => {
                          try {
                            const d = JSON.parse(log.detail);
                            if (d.type === "subscription") return <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-lg">{d.plan?.toUpperCase()} • {d.duration_days}d</span>;
                            if (d.type === "balance") return <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg">+{d.amount} credits</span>;
                          } catch {}
                          return <span className="text-xs text-gray-500">{log.detail}</span>;
                        })()
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-gray-500">
                      {log.redeemed_at ? new Date(log.redeemed_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
              <p className="text-xs text-gray-400">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.total || 0)} of {data?.total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {generatePageNumbers(page, totalPages).map((p, i) =>
                  p === "…" ? (
                    <span key={`e-${i}`} className="px-2 py-1 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={cn(
                        "px-3 py-1 text-xs font-medium rounded-lg transition-colors",
                        page === p
                          ? "bg-primary-600 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("…");
  pages.push(total);

  return pages;
}
