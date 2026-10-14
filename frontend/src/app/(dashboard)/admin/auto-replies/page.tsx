"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useAdminAutoReplies,
  useAdminToggleAutoReply,
  type AdminAutoReplyItem,
} from "@/hooks/use-admin";
import {
  Bot,
  Shield,
  Search,
  RefreshCw,
  Power,
  Clock,
  Copy,
  Check,
  Smartphone,
  User as UserIcon,
  MessageCircleReply,
  Radio,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DataPagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn, formatRelative } from "@/lib/utils";

const PAGE_SIZE = 10;

export default function AdminAutoRepliesPage() {
  const currentUser = useAuthStore((s) => s.user);

  if (currentUser?.role !== "owner") {
    return (
      <div className="text-center py-20 bg-card rounded-2xl border border-border mt-6 shadow-xs">
        <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground/40" />
        <h3 className="font-semibold text-foreground mb-1">Access Denied</h3>
        <p className="text-sm text-muted-foreground">Only system owners can manage platform auto-reply responders.</p>
      </div>
    );
  }

  return <AutoReplyManagementContent />;
}

function AutoReplyManagementContent() {
  const _ = useT();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped">("all");
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<AdminAutoReplyItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, refetch } = useAdminAutoReplies({
    search: debouncedSearch,
    status: statusFilter,
    page,
    limit: PAGE_SIZE,
  });

  const toggleMutation = useAdminToggleAutoReply();

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {_("admin.manageAutoReplies") || "Auto-Reply Management"}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {_("admin.autoRepliesDesc") || "Monitor and control auto-reply bot responders across accounts"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs h-9 cursor-pointer"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin text-primary")} />
            <span>Refresh</span>
          </Button>
          <Link href="/auto-reply">
            <Button
              variant="outline"
              className="text-xs h-9 cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <span>User Auto-Reply</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Responders */}
        <div className="bg-card rounded-xl border border-border shadow-xs p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Responders</p>
            <p className="text-3xl font-extrabold text-card-foreground mt-1">{data?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Configured bot accounts</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Bot className="h-5 w-5" />
          </div>
        </div>

        {/* Running Now */}
        <div className="bg-card rounded-xl border border-border shadow-xs p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Responders</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-card-foreground">{data?.running_count ?? 0}</span>
              {(data?.running_count ?? 0) > 0 && (
                <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                  Listening
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Auto-responding to incoming chats</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20">
            <Radio className="h-5 w-5" />
          </div>
        </div>

        {/* Stopped */}
        <div className="bg-card rounded-xl border border-border shadow-xs p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stopped / Inactive</p>
            <p className="text-3xl font-extrabold text-card-foreground mt-1">{data?.stopped_count ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Disabled or paused accounts</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
            <XCircle className="h-5 w-5" />
          </div>
        </div>

        {/* Total Sent */}
        <div className="bg-card rounded-xl border border-border shadow-xs p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Replied</p>
            <p className="text-3xl font-extrabold text-card-foreground mt-1">
              {(data?.total_sent ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Automatic welcome replies sent</p>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <MessageCircleReply className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-xs">
        {/* Filters */}
        <div className="p-4 border-b border-border bg-muted/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status Tabs */}
          <Tabs
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val as "all" | "running" | "stopped");
              setPage(1);
            }}
          >
            <TabsList className="bg-muted p-1 h-auto rounded-xl">
              <TabsTrigger
                value="all"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-card-foreground data-[state=active]:shadow-xs data-[state=active]:border data-[state=active]:border-border/60 transition-colors"
              >
                All Accounts
              </TabsTrigger>
              <TabsTrigger
                value="running"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-card-foreground data-[state=active]:shadow-xs data-[state=active]:border data-[state=active]:border-border/60 transition-colors"
              >
                Running
              </TabsTrigger>
              <TabsTrigger
                value="stopped"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-card-foreground data-[state=active]:shadow-xs data-[state=active]:border data-[state=active]:border-border/60 transition-colors"
              >
                Stopped
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="admin-auto-replies-search"
              name="search"
              aria-label="Search phone, user email, or text..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone, user email, or text..."
              className="pl-9 h-9 text-xs bg-background rounded-xl border-input placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table className="w-full text-left border-collapse text-xs">
            <TableHeader>
              <TableRow className="bg-muted/50 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold hover:bg-muted/50">
                <TableHead className="py-3 px-4 text-muted-foreground">Account</TableHead>
                <TableHead className="py-3 px-4 text-muted-foreground">Owner / User</TableHead>
                <TableHead className="py-3 px-4 min-w-[220px] text-muted-foreground">Auto-Reply Text</TableHead>
                <TableHead className="py-3 px-4 text-center text-muted-foreground">Status</TableHead>
                <TableHead className="py-3 px-4 text-center text-muted-foreground">Total Replied</TableHead>
                <TableHead className="py-3 px-4 text-muted-foreground">Last Sent</TableHead>
                <TableHead className="py-3 px-4 text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/60">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell className="py-4 px-4 whitespace-normal"><div className="h-4 bg-muted rounded w-28" /></TableCell>
                    <TableCell className="py-4 px-4 whitespace-normal"><div className="h-4 bg-muted rounded w-36" /></TableCell>
                    <TableCell className="py-4 px-4 whitespace-normal"><div className="h-4 bg-muted rounded w-48" /></TableCell>
                    <TableCell className="py-4 px-4 whitespace-normal"><div className="h-5 bg-muted rounded w-16 mx-auto" /></TableCell>
                    <TableCell className="py-4 px-4 whitespace-normal"><div className="h-4 bg-muted rounded w-12 mx-auto" /></TableCell>
                    <TableCell className="py-4 px-4 whitespace-normal"><div className="h-4 bg-muted rounded w-20" /></TableCell>
                    <TableCell className="py-4 px-4 whitespace-normal"><div className="h-6 bg-muted rounded w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : !data || data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center text-muted-foreground whitespace-normal">
                    <Bot className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="font-medium text-foreground text-sm">No auto-reply jobs found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {search ? "Try adjusting your search query" : "No accounts have auto-reply configured yet"}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((item: AdminAutoReplyItem) => {
                  const isRunning = item.status === "running";
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/40 transition-colors">
                      {/* Account info */}
                      <TableCell className="py-3.5 px-4 whitespace-normal">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-muted text-muted-foreground shrink-0">
                            <Smartphone className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">
                              {item.first_name ? `${item.first_name} ${item.last_name || ""}` : item.phone}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {item.phone}
                              {item.username && ` • @${item.username}`}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Owner / User */}
                      <TableCell className="py-3.5 px-4 whitespace-normal">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{item.user_email}</p>
                            {item.user_full_name && (
                              <p className="text-xs text-muted-foreground truncate">{item.user_full_name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Auto-Reply Text */}
                      <TableCell className="py-3.5 px-4 whitespace-normal">
                        {item.auto_reply_text ? (
                          <div className="flex items-center gap-2 group max-w-sm">
                            <span
                              onClick={() => setPreviewItem(item)}
                              className="text-foreground bg-muted/60 border border-border px-2.5 py-1 rounded-lg text-xs truncate max-w-[280px] cursor-pointer hover:border-primary/50 hover:bg-muted transition block"
                              title="Click to view full message"
                            >
                              &quot;{item.auto_reply_text}&quot;
                            </span>
                            <button
                              onClick={() => handleCopy(item.id, item.auto_reply_text!)}
                              className="text-muted-foreground hover:text-foreground transition shrink-0 p-1 rounded hover:bg-muted"
                              title="Copy message"
                            >
                              {copiedId === item.id ? (
                                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">None configured</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3.5 px-4 text-center whitespace-normal">
                        <Badge
                          variant={isRunning ? "success" : item.auto_reply_enabled ? "warning" : "secondary"}
                          className="gap-1.5 text-xs font-semibold"
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              isRunning
                                ? "bg-emerald-500 animate-pulse"
                                : item.auto_reply_enabled
                                ? "bg-amber-500"
                                : "bg-muted-foreground/60"
                            )}
                          />
                          {isRunning ? "Running" : item.auto_reply_enabled ? "Stopped" : "Disabled"}
                        </Badge>
                      </TableCell>

                      {/* Total Replied */}
                      <TableCell className="py-3.5 px-4 text-center whitespace-normal">
                        <span className="font-bold text-foreground">
                          {item.total_replied.toLocaleString()}
                        </span>
                      </TableCell>

                      {/* Last Sent */}
                      <TableCell className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                        {item.last_replied_at ? (
                          <div className="flex items-center gap-1 text-xs">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>{formatRelative(item.last_replied_at)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60 text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-3.5 px-4 text-right whitespace-normal">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={toggleMutation.isPending}
                          onClick={() => toggleMutation.mutate(item.id)}
                          className={cn(
                            "h-7 px-2.5 text-xs font-semibold transition rounded-lg shadow-2xs",
                            item.auto_reply_enabled
                              ? "border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                              : "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                          )}
                          title={item.auto_reply_enabled ? "Turn OFF Auto-Reply" : "Turn ON Auto-Reply"}
                        >
                          <Power className="h-3 w-3 mr-1" />
                          {item.auto_reply_enabled ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-t border-border text-xs text-muted-foreground">
            <div>
              Showing <span className="font-semibold text-foreground">{(page - 1) * PAGE_SIZE + 1}</span> to{" "}
              <span className="font-semibold text-foreground">{Math.min(page * PAGE_SIZE, data.total)}</span> of{" "}
              <span className="font-semibold text-foreground">{data.total}</span> accounts
            </div>
            <DataPagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              disabled={isFetching}
              compact
            />
          </div>
        )}
      </div>

      {/* Message Preview Modal */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        {previewItem && (
          <DialogContent className="max-w-md p-6 space-y-4">
            <DialogHeader className="pr-6">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="font-bold text-foreground text-sm">Auto-Reply Message Preview</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">{previewItem.phone}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="bg-muted/50 border border-border rounded-xl p-3.5 text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {previewItem.auto_reply_text || "No text configured."}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Replied: {previewItem.total_replied.toLocaleString()} times
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (previewItem.auto_reply_text) {
                    handleCopy(previewItem.id, previewItem.auto_reply_text);
                  }
                }}
                className="text-xs flex items-center gap-1.5"
              >
                {copiedId === previewItem.id ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedId === previewItem.id ? "Copied" : "Copy Message"}</span>
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
