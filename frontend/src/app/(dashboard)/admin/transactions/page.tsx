"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import {
  useBankAccountStore,
  type WalletTransaction,
  type TransactionStatus,
  type TransactionType,
} from "@/store/bank-account-store";
import {
  useAdminWalletTransactions,
  useAdminUpdateTransactionStatus,
} from "@/hooks/use-wallet";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Eye,
  Check,
  X,
  Copy,
  Wallet,
  Coins,
  Ticket,
  Sliders,
  Shield,
  CreditCard,
  Building2,
  ExternalLink,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_STYLES: Record<TransactionStatus, string> = {
  pending:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  rejected:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
};

function formatIDR(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminTransactionsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const _ = useT();

  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TransactionStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState<WalletTransaction | null>(null);
  const [rejectingTx, setRejectingTx] = useState<WalletTransaction | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: adminTxData, isLoading: isTxLoading, refetch: refetchAdminTxs } = useAdminWalletTransactions({
    type: typeFilter !== "all" ? typeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: searchQuery.trim() || undefined,
    limit: 100,
  });
  const updateStatusMutation = useAdminUpdateTransactionStatus();

  const transactions: WalletTransaction[] = useMemo(() => {
    if (adminTxData?.transactions) {
      return adminTxData.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        method: t.method,
        note: t.note || "",
        createdAt: t.created_at,
        status: t.status,
        adminNote: t.admin_note || undefined,
        userId: t.user_id,
        userEmail: t.user_email || undefined,
        processedAt: t.processed_at || undefined,
      }));
    }
    return [];
  }, [adminTxData?.transactions]);

  // Statistics
  const metrics = useMemo(() => {
    const totalDeposits = transactions
      .filter((t) => t.type === "topup" && t.status === "approved")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalWithdrawals = transactions
      .filter((t) => t.type === "withdraw" && t.status === "approved")
      .reduce((sum, t) => sum + t.amount, 0);

    const pendingCount = transactions.filter((t) => t.status === "pending").length;
    const totalTransactions = transactions.length;

    return {
      totalDeposits,
      totalWithdrawals,
      pendingCount,
      totalTransactions,
    };
  }, [transactions]);

  // Filtered List
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = t.id.toLowerCase().includes(q);
        const matchMethod = t.method.toLowerCase().includes(q);
        const matchNote = t.note.toLowerCase().includes(q);
        const matchEmail = (t.userEmail || "").toLowerCase().includes(q);
        if (!matchId && !matchMethod && !matchNote && !matchEmail) return false;
      }

      return true;
    });
  }, [transactions, typeFilter, statusFilter, searchQuery]);

  if (currentUser?.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-3">
        <Shield className="h-12 w-12 text-rose-500" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Akses Ditolak</h2>
        <p className="text-xs text-gray-500 max-w-sm">
          Halaman Alur Transaksi Deposit & Penarikan ini hanya dapat diakses oleh Administrator Owner.
        </p>
      </div>
    );
  }

  async function handleApprove(tx: WalletTransaction) {
    try {
      await updateStatusMutation.mutateAsync({
        txId: tx.id,
        status: "approved",
        adminNote: "Disetujui oleh Administrator",
      });
      toast.success(`Transaksi ${tx.id} berhasil disetujui`);
      if (selectedTx?.id === tx.id) {
        setSelectedTx((prev) => (prev ? { ...prev, status: "approved" } : null));
      }
      refetchAdminTxs();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyetujui transaksi");
    }
  }

  async function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectingTx) return;

    try {
      await updateStatusMutation.mutateAsync({
        txId: rejectingTx.id,
        status: "rejected",
        adminNote: rejectReason.trim() || "Ditolak oleh Administrator",
      });
      toast.success(`Transaksi ${rejectingTx.id} telah ditolak`);
      if (selectedTx?.id === rejectingTx.id) {
        setSelectedTx((prev) => (prev ? { ...prev, status: "rejected" } : null));
      }
      setRejectingTx(null);
      setRejectReason("");
      refetchAdminTxs();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menolak transaksi");
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <Wallet className="h-6 w-6 text-emerald-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-50">
              Alur Transaksi Deposit & Penarikan
            </h1>
            {metrics.pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
                <Clock className="h-3 w-3" />
                {metrics.pendingCount} Menunggu Tindakan
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-slate-400 text-xs sm:text-sm mt-1">
            Pantau dan verifikasi seluruh arus dana masuk (Deposit QRIS/Bank) dan penarikan saldo pengguna TeleBos.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href="/admin/settings?tab=payment"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:text-primary-600 transition shadow-2xs"
          >
            <Sliders className="h-4 w-4 text-primary-500" />
            <span>Atur Gateway Deposit</span>
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Deposits Approved */}
        <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Total Deposit Masuk
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                <ArrowDownToLine className="h-4 w-4" />
              </div>
            </div>
            <p className="font-mono text-2xl font-bold text-gray-900 dark:text-slate-100">
              +{formatIDR(metrics.totalDeposits)}
            </p>
            <p className="text-[11px] text-emerald-600 font-medium">Dana masuk terverifikasi</p>
          </CardContent>
        </Card>

        {/* Total Withdrawals Approved */}
        <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Total Penarikan Keluar
              </span>
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600">
                <ArrowUpFromLine className="h-4 w-4" />
              </div>
            </div>
            <p className="font-mono text-2xl font-bold text-gray-900 dark:text-slate-100">
              -{formatIDR(metrics.totalWithdrawals)}
            </p>
            <p className="text-[11px] text-blue-600 font-medium">Dana penarikan dicairkan</p>
          </CardContent>
        </Card>

        {/* Pending Requests */}
        <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Menunggu Tindakan
              </span>
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <p className="font-mono text-2xl font-bold text-gray-900 dark:text-slate-100">
              {metrics.pendingCount} Transaksi
            </p>
            <p className="text-[11px] text-amber-600 font-medium">Perlu persetujuan admin</p>
          </CardContent>
        </Card>

        {/* Total Transactions */}
        <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Total Riwayat Arus
              </span>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600">
                <CreditCard className="h-4 w-4" />
              </div>
            </div>
            <p className="font-mono text-2xl font-bold text-gray-900 dark:text-slate-100">
              {metrics.totalTransactions} Transaksi
            </p>
            <p className="text-[11px] text-slate-500 font-medium">Keseluruhan entri kas</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-gray-200 dark:border-slate-800 shadow-xs">
        <div className="p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Type Filter Tabs */}
          <Tabs
            value={typeFilter}
            onValueChange={(val) => setTypeFilter(val as any)}
            className="w-auto self-start"
          >
            <TabsList className="bg-gray-100 dark:bg-slate-800/80 p-1 rounded-xl h-auto gap-1 flex items-center overflow-x-auto">
              <TabsTrigger
                value="all"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-slate-100 data-[state=active]:shadow-2xs"
              >
                Semua Jenis
              </TabsTrigger>
              <TabsTrigger
                value="topup"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300 data-[state=active]:shadow-2xs"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                <span>Deposit</span>
              </TabsTrigger>
              <TabsTrigger
                value="withdraw"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300 data-[state=active]:shadow-2xs"
              >
                <ArrowUpFromLine className="h-3.5 w-3.5" />
                <span>Penarikan</span>
              </TabsTrigger>
              <TabsTrigger
                value="redeem"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-purple-700 dark:data-[state=active]:text-purple-300 data-[state=active]:shadow-2xs"
              >
                <Ticket className="h-3.5 w-3.5" />
                <span>Redeem</span>
              </TabsTrigger>
              <TabsTrigger
                value="admin_adjustment"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300 data-[state=active]:shadow-2xs"
              >
                <Coins className="h-3.5 w-3.5" />
                <span>Saldo Admin</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Status selector and Search input */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
              <SelectTrigger className="h-9 w-full sm:w-[170px] text-xs">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="pending">Menunggu (Pending)</SelectItem>
                <SelectItem value="approved">Disetujui (Approved)</SelectItem>
                <SelectItem value="rejected">Ditolak (Rejected)</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="h-3.5 w-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari ID, email, atau catatan..."
                className="h-9 pl-8 pr-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 w-full sm:w-56"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table of Transactions */}
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/70 dark:bg-slate-800/40">
                  <TableHead className="py-3 px-4 text-xs font-semibold">ID & Tanggal</TableHead>
                  <TableHead className="py-3 px-4 text-xs font-semibold">Jenis / Metode</TableHead>
                  <TableHead className="py-3 px-4 text-xs font-semibold">Nominal</TableHead>
                  <TableHead className="py-3 px-4 text-xs font-semibold">Keterangan / Rekening</TableHead>
                  <TableHead className="py-3 px-4 text-xs font-semibold">Status</TableHead>
                  <TableHead className="py-3 px-4 text-xs font-semibold text-right">Tindakan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-slate-800">
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-xs text-gray-500">
                      Tidak ada transaksi yang cocok dengan filter yang dipilih.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                      {/* ID & Date */}
                      <TableCell className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="font-mono text-xs font-bold text-gray-900 dark:text-slate-100 block">
                            {tx.id}
                          </span>
                          <span className="text-[11px] text-gray-400 dark:text-slate-500 block">
                            {formatDate(tx.createdAt)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Type & Method */}
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs",
                              tx.type === "topup"
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600"
                                : tx.type === "withdraw"
                                ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600"
                                : tx.type === "redeem"
                                ? "bg-purple-50 dark:bg-purple-950/40 text-purple-600"
                                : "bg-amber-50 dark:bg-amber-950/40 text-amber-600"
                            )}
                          >
                            {tx.type === "topup" && <ArrowDownToLine className="h-3.5 w-3.5" />}
                            {tx.type === "withdraw" && <ArrowUpFromLine className="h-3.5 w-3.5" />}
                            {tx.type === "redeem" && <Ticket className="h-3.5 w-3.5" />}
                            {tx.type === "admin_adjustment" && <Coins className="h-3.5 w-3.5" />}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-gray-800 dark:text-slate-200 block capitalize">
                              {tx.type === "topup"
                                ? "Deposit Saldo"
                                : tx.type === "withdraw"
                                ? "Penarikan Dana"
                                : tx.type === "redeem"
                                ? "Redeem Voucher"
                                : "Saldo Admin"}
                            </span>
                            <span className="text-[10px] text-gray-400">{tx.method}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="py-3 px-4">
                        <span
                          className={cn(
                            "font-mono text-xs font-bold",
                            tx.type === "topup" || tx.type === "redeem"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : tx.type === "withdraw"
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-amber-600 dark:text-amber-400"
                          )}
                        >
                          {tx.type === "topup" || tx.type === "redeem" ? "+" : "-"} {formatIDR(tx.amount)}
                        </span>
                      </TableCell>

                      {/* Note */}
                      <TableCell className="py-3 px-4">
                        <p className="text-xs text-gray-600 dark:text-slate-300 truncate max-w-xs">
                          {tx.note}
                        </p>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3 px-4">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize",
                            STATUS_STYLES[tx.status]
                          )}
                        >
                          {tx.status === "approved"
                            ? "Disetujui"
                            : tx.status === "pending"
                            ? "Menunggu"
                            : "Ditolak"}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {tx.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApprove(tx)}
                                className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition cursor-pointer"
                                title="Setujui transaksi"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingTx(tx);
                                  setRejectReason("");
                                }}
                                className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition cursor-pointer"
                                title="Tolak transaksi"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setSelectedTx(tx)}
                            className="h-8 text-xs text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            <span>Detail</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── TRANSACTION DETAIL AUDIT MODAL ── */}
      <Dialog
        open={!!selectedTx}
        onOpenChange={(open) => {
          if (!open) setSelectedTx(null);
        }}
      >
        {selectedTx && (
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <DialogHeader className="p-5 border-b border-gray-100 dark:border-slate-800 flex flex-row items-center justify-between text-left space-y-0">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary-500" />
                <DialogTitle className="text-sm font-bold text-gray-900 dark:text-slate-100">
                  Audit Transaksi Keuangan
                </DialogTitle>
              </div>
              <DialogDescription className="sr-only">
                Detail audit transaksi #{selectedTx.id}
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center space-y-1">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
                  Nominal Transaksi
                </span>
                <p className="font-mono text-2xl font-bold text-gray-900 dark:text-slate-100">
                  {selectedTx.type === "topup" || selectedTx.type === "redeem" ? "+" : "-"} {formatIDR(selectedTx.amount)}
                </p>
                <div className="pt-1">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize",
                      STATUS_STYLES[selectedTx.status]
                    )}
                  >
                    {selectedTx.status}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 divide-y divide-gray-100 dark:divide-slate-800">
                <div className="flex items-center justify-between pt-1">
                  <span className="text-gray-500">ID Transaksi</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-slate-100">{selectedTx.id}</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-gray-500">Jenis Transaksi</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-100 capitalize">{selectedTx.type}</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-gray-500">Metode / Saluran</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">{selectedTx.method}</span>
                </div>
                <div className="flex items-start justify-between pt-2 gap-2">
                  <span className="text-gray-500 shrink-0">Catatan / Rekening</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-100 text-right">{selectedTx.note}</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-gray-500">Waktu Masuk</span>
                  <span className="font-mono text-gray-900 dark:text-slate-100">{formatDate(selectedTx.createdAt)}</span>
                </div>
                {selectedTx.adminNote && (
                  <div className="flex items-start justify-between pt-2 gap-2">
                    <span className="text-gray-500 shrink-0">Catatan Admin</span>
                    <span className="text-gray-700 dark:text-slate-300 text-right">{selectedTx.adminNote}</span>
                  </div>
                )}
              </div>

              {/* Action buttons inside modal if still pending */}
              {selectedTx.status === "pending" && (
                <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex gap-2">
                  <Button
                    onClick={() => handleApprove(selectedTx)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 cursor-pointer"
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    <span>Setujui Transaksi</span>
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setRejectingTx(selectedTx);
                      setRejectReason("");
                    }}
                    className="flex-1 text-xs h-9 cursor-pointer"
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    <span>Tolak Transaksi</span>
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* ── REJECT REASON MODAL ── */}
      <Dialog
        open={!!rejectingTx}
        onOpenChange={(open) => {
          if (!open) setRejectingTx(null);
        }}
      >
        {rejectingTx && (
          <DialogContent className="max-w-sm p-6 space-y-4">
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-base font-bold text-gray-900 dark:text-slate-100">
                Tolak Permintaan Transaksi
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Tolak transaksi ID <span className="font-mono font-bold">{rejectingTx.id}</span> ({formatIDR(rejectingTx.amount)}).
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                  Alasan Penolakan
                </label>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Misal: Bukti transfer tidak valid / saldo tidak masuk"
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectingTx(null)}
                  className="flex-1 text-xs cursor-pointer"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  className="flex-1 text-xs cursor-pointer"
                >
                  Konfirmasi Tolak
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
