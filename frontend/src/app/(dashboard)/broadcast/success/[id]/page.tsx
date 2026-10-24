"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBroadcastJob, useGroupLists, useTextLists } from "@/hooks/use-broadcast";
import { useT } from "@/lib/i18n";
import { CheckCircle, ArrowLeft, FileText, List, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BroadcastSuccessPage({ params }: { params: { id: string } }) {
  const _ = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalJobsParam = searchParams.get("totalJobs");
  const { data: job, isLoading: jobLoading } = useBroadcastJob(params.id);
  const { data: groupLists } = useGroupLists();
  const { data: textLists } = useTextLists();

  if (jobLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <p className="text-gray-500">Broadcast not found.</p>
        <button
          onClick={() => router.push("/broadcast")}
          className="text-primary-600 hover:underline"
        >
          Back to Broadcast
        </button>
      </div>
    );
  }

  const groupList = groupLists?.find((gl) => gl.id === job.group_list_id);
  const textList = textLists?.find((tl) => tl.id === job.text_list_id);
  const totalJobs = job.related_job_ids?.length || (totalJobsParam ? parseInt(totalJobsParam, 10) : 1);

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <div className="bg-card text-card-foreground rounded-xl border border-border p-8 text-center space-y-6 shadow-sm">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-emerald-500" />
        </div>
        
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Broadcast Started Successfully</h1>
          <p className="text-muted-foreground">Your broadcast has been created and is now running in the background.</p>
        </div>

        {totalJobs > 1 && (
          <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-lg p-4 text-left space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-sky-600 dark:text-sky-400 flex-shrink-0" />
              <span className="font-semibold text-sky-900 dark:text-sky-100 text-sm">
                {totalJobs} Job Siaran Mandiri Telah Dibuat
              </span>
            </div>
            <p className="text-xs text-sky-700 dark:text-sky-300 pl-7">
              Setiap akun yang dipilih menjalankan siaran ke seluruh daftar grup ({job.total_groups} grup) secara mandiri. Anda dapat memantau atau mengelola masing-masing job di Riwayat Siaran.
            </p>
          </div>
        )}

        <div className="bg-muted/40 rounded-lg p-6 text-left space-y-4 border border-border mt-6">
          <h3 className="font-semibold text-foreground border-b border-border pb-2">Broadcast Details</h3>
          
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div className="flex items-start gap-2">
              <List className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-muted-foreground text-xs">Group List</p>
                <p className="font-medium text-foreground">{groupList?.name || "Unknown"} ({job.total_groups} groups)</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-muted-foreground text-xs">Text Source</p>
                <p className="font-medium text-foreground">
                  {job.mode === "single_text" ? "Custom Text" : (textList?.name || "Unknown")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-muted-foreground text-xs">Delay per Group</p>
                <p className="font-medium text-foreground">
                  {job.delay_randomized ? "5-30s (Random)" : `${job.delay_per_group}s`}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-muted-foreground text-xs">Delay after Cycle</p>
                <p className="font-medium text-foreground">{job.delay_after_all}s</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => router.push("/broadcast/new")}
            className="h-10 px-5 text-sm cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Kembali
          </Button>
          {totalJobs > 1 ? (
            <Button
              onClick={() => router.push("/broadcast/history")}
              className="h-10 px-5 text-sm cursor-pointer"
            >
              <List className="h-4 w-4 mr-1.5" />
              Lihat Riwayat Siaran
            </Button>
          ) : (
            <Button
              onClick={() => router.push(`/broadcast/logs?jobId=${job.id}`)}
              className="h-10 px-5 text-sm cursor-pointer"
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Lihat Log
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
