"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBroadcastJob, useGroupLists, useTextLists } from "@/hooks/use-broadcast";
import { useT } from "@/lib/i18n";
import { CheckCircle, ArrowLeft, FileText, List, Clock, Loader2 } from "lucide-react";

export default function BroadcastSuccessPage({ params }: { params: { id: string } }) {
  const _ = useT();
  const router = useRouter();
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

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-6">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Broadcast Started Successfully</h1>
          <p className="text-gray-500">Your broadcast has been created and is now running in the background.</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-6 text-left space-y-4 border border-gray-100 mt-6">
          <h3 className="font-semibold text-gray-900 border-b pb-2">Broadcast Details</h3>
          
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div className="flex items-start gap-2">
              <List className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Group List</p>
                <p className="font-medium text-gray-900">{groupList?.name || "Unknown"} ({job.total_groups} groups)</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Text Source</p>
                <p className="font-medium text-gray-900">
                  {job.mode === "single_text" ? "Custom Text" : (textList?.name || "Unknown")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Delay per Group</p>
                <p className="font-medium text-gray-900">
                  {job.delay_randomized ? "5-30s (Random)" : `${job.delay_per_group}s`}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Delay after Cycle</p>
                <p className="font-medium text-gray-900">{job.delay_after_all}s</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4 justify-center pt-4">
          <button
            onClick={() => router.push("/broadcast/new")}
            className="flex items-center gap-2 px-6 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={() => router.push(`/broadcast/logs?jobId=${job.id}`)}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
          >
            <FileText className="h-4 w-4" />
            View Logs
          </button>
        </div>
      </div>
    </div>
  );
}
