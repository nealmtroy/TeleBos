"use client";

import { useParams } from "next/navigation";
import { useAccount } from "@/hooks/use-accounts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Monitor, Globe, Trash2, Shield } from "lucide-react";
import api from "@/lib/api";
import { formatDate, cn } from "@/lib/utils";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { useT } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useState } from "react";
import { toast } from "sonner";

interface Device {
  hash: string;
  app_name: string;
  device_model: string;
  platform: string;
  system_version: string;
  ip: string;
  country: string;
  created: string;
  current: boolean;
}

export default function DevicesPage() {
  const _ = useT();
  const params = useParams();
  const id = params.id as string;
  const { data: account } = useAccount(id);
  const queryClient = useQueryClient();
  const [terminateAllOpen, setTerminateAllOpen] = useState(false);

  const { data: devicesData, isLoading, error } = useQuery<{ devices: Device[] }>({
    queryKey: ["devices", id],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${id}/devices`);
      return data;
    },
  });

  const terminateMutation = useMutation({
    mutationFn: async (hash: string) => {
      await api.delete(`/accounts/${id}/devices/${hash}`);
    },
    onSuccess: () => {
      toast.success(_("devices.sessionTerminated"));
      queryClient.invalidateQueries({ queryKey: ["devices", id] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || _("devices.terminateSessionFailed"));
    },
  });

  const terminateAllMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/accounts/${id}/devices`);
    },
    onSuccess: () => {
      toast.success(_("devices.otherSessionsTerminated"));
      queryClient.invalidateQueries({ queryKey: ["devices", id] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || _("devices.terminateOtherSessionsFailed"));
    },
  });

  const devices = devicesData?.devices || [];
  const currentDevice = devices.find((device) => device.current);
  const otherDevices = devices.filter((device) => !device.current);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/accounts/${id}`}
          aria-label={_("accountDetail.backToAccounts")}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{_("devices.title")}</h1>
          <p className="text-sm text-gray-500">
            {_("devices.activeSessions", { name: account?.first_name || "Account" })}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => <CardSkeleton key={index} lines={3} />)}
        </div>
      ) : error ? (
        <div className="py-12 text-center text-gray-500">{_("devices.failedToLoad")}</div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
          <Monitor className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">{_("devices.noDevices")}</p>
        </div>
      ) : (
        <>
          {currentDevice && (
            <section aria-labelledby="current-device-heading" className="space-y-3">
              <h2 id="current-device-heading" className="text-sm font-semibold text-foreground">
                {_("devices.thisDevice")}
              </h2>
              <DeviceCard device={currentDevice} onTerminate={terminateMutation.mutate} pending={terminateMutation.isPending} />
            </section>
          )}

          <section className="rounded-xl border border-red-200 bg-white p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold text-red-600">
              <Shield className="h-4 w-4" />
              {_("devices.terminateAll")}
            </h2>
            <p className="mb-4 mt-1 text-sm text-gray-500">{_("devices.terminateAllDesc")}</p>
            <button
              onClick={() => setTerminateAllOpen(true)}
              disabled={terminateAllMutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-red-500/30 disabled:bg-red-300"
            >
              {terminateAllMutation.isPending ? _("devices.terminating") : _("devices.terminateAllBtn")}
            </button>
          </section>

          {otherDevices.length > 0 && (
            <section aria-labelledby="other-devices-heading" className="space-y-3">
              <h2 id="other-devices-heading" className="text-sm font-semibold text-foreground">
                {_("devices.otherDevices")}
              </h2>
              <div className="space-y-3">
                {otherDevices.map((device) => (
                  <DeviceCard key={device.hash} device={device} onTerminate={terminateMutation.mutate} pending={terminateMutation.isPending} />
                ))}
              </div>
            </section>
          )}

          <ConfirmDialog
            open={terminateAllOpen}
            onOpenChange={setTerminateAllOpen}
            onConfirm={() => {
              terminateAllMutation.mutate();
              setTerminateAllOpen(false);
            }}
            title={_("devices.terminateAll")}
            message={_("devices.terminateAllConfirm")}
            confirmText={_("devices.terminateAllBtn")}
            cancelText={_("navbar.cancel")}
            variant="danger"
            loading={terminateAllMutation.isPending}
          />
        </>
      )}
    </div>
  );
}

function DeviceCard({ device, onTerminate, pending }: { device: Device; onTerminate: (hash: string) => void; pending: boolean }) {
  const _ = useT();

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-colors sm:p-5",
      device.current ? "border-emerald-200 bg-emerald-50/30 ring-1 ring-emerald-100/50" : "border-gray-200 bg-white hover:border-gray-300"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className={cn("rounded-lg p-2.5", device.current ? "bg-emerald-100 text-emerald-900" : "bg-gray-100 text-gray-600")}>
            <Monitor className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{device.app_name || _("devices.unknownApp")}</h3>
              {device.current && <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">{_("devices.thisDevice")}</span>}
            </div>
            <div className="mt-1 space-y-1">
              <p className="text-xs text-gray-500">{[device.device_model, device.platform, device.system_version].filter(Boolean).join(" · ")}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                {device.ip && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{device.ip}</span>}
                {device.country && <span>{device.country}</span>}
                {device.created && <span>{_("devices.since", { date: formatDate(device.created) })}</span>}
              </div>
            </div>
          </div>
        </div>
        {device.current ? (
          <div className="p-2 text-emerald-600" title={_("devices.thisDevice")}><Shield className="h-4.5 w-4.5" /></div>
        ) : (
          <button
            onClick={() => onTerminate(device.hash)}
            disabled={pending}
            aria-label={_("devices.terminate")}
            className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-red-500/30 disabled:opacity-50"
            title={_("devices.terminate")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
