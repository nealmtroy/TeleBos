"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useAdminRedeemLogs } from "@/hooks/use-admin-redeem";
import {
  Shield, AlertCircle, ClipboardList,
} from "lucide-react";
import { DataPagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

export default function AdminRedeemLogsPage() {
  const _ = useT();
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-16">
        <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground/40" />
        <h3 className="font-semibold text-foreground mb-1">Access Denied</h3>
        <p className="text-sm text-muted-foreground">Only owners can access the admin panel.</p>
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
        <h1 className="text-2xl font-bold text-foreground">{_("adminRedeem.logs")}</h1>
        <p className="text-muted-foreground mt-1">{_("adminRedeem.desc")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load redemption logs</p>
        </div>
      ) : !data?.logs.length ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border shadow-xs">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{_("adminRedeem.noLogs")}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-xs">
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">{_("adminRedeem.code")}</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">{_("adminRedeem.user")}</TableHead>
                  <TableHead className="text-center py-3 px-4 font-semibold text-muted-foreground">{_("adminRedeem.detail")}</TableHead>
                  <TableHead className="text-right py-3 px-4 font-semibold text-muted-foreground">{_("adminRedeem.redeemedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.logs.map((log) => (
                  <TableRow key={log.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <TableCell className="py-3 px-4 whitespace-normal">
                      <code className="font-mono text-xs bg-muted px-2 py-1 rounded font-semibold">{log.code}</code>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-foreground font-medium whitespace-normal">{log.user_email}</TableCell>
                    <TableCell className="py-3 px-4 text-center whitespace-normal">
                      {log.detail ? (
                        (() => {
                          try {
                            const d = JSON.parse(log.detail);
                            if (d.type === "subscription") return <span className="text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md">{d.plan?.toUpperCase()} • {d.duration_days}d</span>;
                            if (d.type === "balance") return <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">+{d.amount} credits</span>;
                          } catch {}
                          return <span className="text-xs text-muted-foreground">{log.detail}</span>;
                        })()
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right text-xs text-muted-foreground whitespace-normal">
                      {log.redeemed_at ? new Date(log.redeemed_at).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3 bg-card rounded-xl border border-border shadow-2xs">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.total || 0)} of {data?.total}
              </p>
              <DataPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                className="w-auto mx-0"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
