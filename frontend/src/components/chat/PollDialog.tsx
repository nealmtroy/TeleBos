import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X, BarChart } from "lucide-react";
import api from "@/lib/api";

interface PollDialogProps {
  accountId: string;
  chatId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function PollDialog({ accountId, chatId, isOpen, onClose }: PollDialogProps) {
  const queryClient = useQueryClient();
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollAnonymous, setPollAnonymous] = useState(true);
  const [pollIsQuiz, setPollIsQuiz] = useState(false);
  const [pollCorrectIdx, setPollCorrectIdx] = useState<number | null>(null);

  const sendPollMutation = useMutation({
    mutationFn: async (payload: {
      question: string;
      options: string[];
      is_anonymous: boolean;
      is_quiz: boolean;
      correct_option_idx: number | null;
    }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/polls`, payload);
    },
    onSuccess: () => {
      onClose();
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollAnonymous(true);
      setPollIsQuiz(false);
      setPollCorrectIdx(null);
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
    },
    onError: (err: any) => {
      alert("Failed to send poll: " + (err.response?.data?.detail || err.message));
    }
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#17212b] rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 font-display">
            <BarChart className="h-4.5 w-4.5 text-primary" />
            Create Poll
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scroll space-y-4 text-left">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Question
            </label>
            <input
              type="text"
              placeholder="Ask a question..."
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white font-medium text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Poll Options
            </label>
            <div className="space-y-2">
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={`Option ${idx + 1}`}
                    value={opt}
                    onChange={(e) => {
                      const updated = [...pollOptions];
                      updated[idx] = e.target.value;
                      setPollOptions(updated);
                    }}
                    className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white text-xs font-medium"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      onClick={() => {
                        const updated = pollOptions.filter((_, i) => i !== idx);
                        setPollOptions(updated);
                        if (pollCorrectIdx === idx) setPollCorrectIdx(null);
                        else if (pollCorrectIdx !== null && pollCorrectIdx > idx) {
                          setPollCorrectIdx(pollCorrectIdx - 1);
                        }
                      }}
                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition"
                      title="Remove choice"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < 10 && (
              <button
                onClick={() => setPollOptions([...pollOptions, ""])}
                className="text-xs text-primary font-bold hover:underline mt-2 inline-block"
              >
                + Add an Option
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Anonymous Voting
              </label>
              <input
                type="checkbox"
                checked={pollAnonymous}
                onChange={(e) => setPollAnonymous(e.target.checked)}
                className="h-4 w-4 text-primary rounded border-slate-350 focus:ring-primary focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Quiz Mode
              </label>
              <input
                type="checkbox"
                checked={pollIsQuiz}
                onChange={(e) => {
                  setPollIsQuiz(e.target.checked);
                  if (!e.target.checked) setPollCorrectIdx(null);
                }}
                className="h-4 w-4 text-primary rounded border-slate-350 focus:ring-primary focus:outline-none cursor-pointer"
              />
            </div>

            {pollIsQuiz && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Correct Choice
                </label>
                <select
                  value={pollCorrectIdx ?? ""}
                  onChange={(e) => setPollCorrectIdx(e.target.value === "" ? null : Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white text-xs font-medium"
                >
                  <option value="">Select correct option...</option>
                  {pollOptions.map((opt, idx) => (
                    <option key={idx} value={idx}>
                      Option {idx + 1}: {opt || "(Empty)"}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const cleanedOptions = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
              if (!pollQuestion.trim()) {
                alert("Please specify a question.");
                return;
              }
              if (cleanedOptions.length < 2) {
                alert("Please provide at least 2 choices.");
                return;
              }
              if (pollIsQuiz && pollCorrectIdx === null) {
                alert("Please select the correct choice for Quiz mode.");
                return;
              }
              sendPollMutation.mutate({
                question: pollQuestion,
                options: cleanedOptions,
                is_anonymous: pollAnonymous,
                is_quiz: pollIsQuiz,
                correct_option_idx: pollCorrectIdx,
              });
            }}
            disabled={sendPollMutation.isPending}
            className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:opacity-90 active:scale-95 shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {sendPollMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create Poll
          </button>
        </div>
      </div>
    </div>
  );
}
