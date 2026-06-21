"use client";

import { useParams } from "next/navigation";
import { useAccount } from "@/hooks/use-accounts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Monitor, Smartphone, Globe, Trash2, Shield } from "lucide-react";
import api from "@/lib/api";
import { formatDate, cn } from "@/lib/utils";
import { CardSkeleton } from "@/components/ui/skeleton-cards";
import { useT } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useState } from "react";

interface Device {
  hash: string;
  app_name: string;
  device_model: string;
  platform: string;
  system_version: string;
  ip: string;
  country: string;
  created: string;
}

export default function DevicesPage() {
  const _ = useT();
  const params = useParams();
  const id = params.id as string;
  const { data: account } = useAccount(id);
  const queryClient = useQueryClient();

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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["devices", id] }),
  });

  const terminateAllMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/accounts/${id}/devices`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["devices", id] }),
  });

  const [terminateAllOpen, setTerminateAllOpen] = useState(false);
  const devices = devicesData?.devices || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/accounts/${id}`} className="p-2 hover:bg-gray-100 rounded-lg">
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
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} lines={3} />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 text-gray-500">{_("devices.failedToLoad")}</div>
      ) : devices.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Monitor className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">{_("devices.noDevices")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {devices.map((device) => (
              <div
                key={device.hash}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-gray-100 rounded-lg">
                      <Monitor className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {device.app_name || _("devices.unknownApp")}
                      </h3>
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-gray-500">
                          {[
                            device.device_model,
                            device.platform,
                            device.system_version,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          {device.ip && (
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {device.ip}
                            </span>
                          )}
                          {device.country && (
                            <span>{device.country}</span>
                          )}
                          {device.created && (
                            <span>{_("devices.since", { date: formatDate(device.created) })}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => terminateMutation.mutate(device.hash)}
                    disabled={terminateMutation.isPending}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                    title={_("devices.terminate")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Terminate all */}
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <h3 className="font-semibold text-red-600 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {_("devices.terminateAll")}
            </h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              {_("devices.terminateAllDesc")}
            </p>
            <button
              onClick={() => setTerminateAllOpen(true)}
              disabled={terminateAllMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:bg-red-300 transition"
            >
              {terminateAllMutation.isPending
                ? _("devices.terminating")
                : _("devices.terminateAllBtn")}
            </button>
          </div>

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
