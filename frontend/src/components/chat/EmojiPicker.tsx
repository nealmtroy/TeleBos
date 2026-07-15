import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { EMOJI_CATEGORIES, MOCK_GIFS, EMOJI_SUGGESTIONS } from "./constants";

interface EmojiPickerProps {
  accountId: string;
  chatId: number;
  isOpen: boolean;
  onClose: () => void;
  getApiUrl: () => string;
  getAuthParam: () => string;
  setMessageText: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export function EmojiPicker({
  accountId,
  chatId,
  isOpen,
  onClose,
  getApiUrl,
  getAuthParam,
  setMessageText,
  inputRef,
}: EmojiPickerProps) {
  const queryClient = useQueryClient();
  const [pickerTab, setPickerTab] = useState<"emoji" | "gif" | "sticker">("emoji");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [gifSearch, setGifSearch] = useState("");
  const [stickerSearch, setStickerSearch] = useState("");
  const [selectedStickerSet, setSelectedStickerSet] = useState<string | null>(null);

  // Queries
  const { data: stickerSetsData } = useQuery({
    queryKey: ["sticker-sets", accountId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/stickers`);
      return data?.packs || [];
    },
    enabled: !!accountId && isOpen && pickerTab === "sticker",
  });

  const { data: stickerSetDetails, isLoading: isLoadingStickers } = useQuery({
    queryKey: ["sticker-set-details", accountId, selectedStickerSet],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/stickers/sets/${selectedStickerSet}`);
      return data?.stickers || [];
    },
    enabled: !!accountId && !!selectedStickerSet && isOpen && pickerTab === "sticker",
  });

  const { data: savedGifsData } = useQuery({
    queryKey: ["saved-gifs", accountId],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/gifs/saved`);
      return data?.gifs || [];
    },
    enabled: !!accountId && isOpen && pickerTab === "gif" && !gifSearch,
  });

  const { data: searchedGifsData, isLoading: isSearchingGifs } = useQuery({
    queryKey: ["searched-gifs", accountId, gifSearch],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/gifs/search?q=${gifSearch}`);
      return data?.gifs || [];
    },
    enabled: !!accountId && isOpen && pickerTab === "gif" && !!gifSearch,
  });

  const { data: searchedStickersData, isLoading: isSearchingStickers } = useQuery({
    queryKey: ["searched-stickers", accountId, stickerSearch],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${accountId}/stickers/search?q=${stickerSearch}`);
      return data || { stickers: [], sets: [] };
    },
    enabled: !!accountId && isOpen && pickerTab === "sticker" && !!stickerSearch,
  });

  // Mutations
  const sendStickerMutation = useMutation({
    mutationFn: async (payload: { document_id: string; access_hash: string; file_reference?: string }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/stickers`, payload);
    },
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
    },
  });

  const sendGifMutation = useMutation({
    mutationFn: async (payload: { document_id: string; access_hash: string; file_reference: string }) => {
      await api.post(`/accounts/${accountId}/chats/${chatId}/gifs`, payload);
    },
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries({ queryKey: ["messages", accountId, chatId] });
    },
  });

  const saveGifMutation = useMutation({
    mutationFn: async (payload: { document_id: string; access_hash: string; unsave: boolean }) => {
      await api.post(`/accounts/${accountId}/gifs/save`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-gifs", accountId] });
    },
  });

  // Select first sticker set automatically
  useEffect(() => {
    if (pickerTab === "sticker" && stickerSetsData && stickerSetsData.length > 0 && !selectedStickerSet) {
      setSelectedStickerSet(stickerSetsData[0].short_name);
    }
  }, [pickerTab, stickerSetsData, selectedStickerSet]);

  const handleSendGif = (gif: any) => {
    sendGifMutation.mutate({
      document_id: gif.id,
      access_hash: gif.access_hash,
      file_reference: gif.file_reference,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="absolute bottom-16 left-4 bg-white dark:bg-[#17212b] border border-slate-200/50 dark:border-none rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.15)] p-3.5 z-30 w-80 h-96 flex flex-col animate-in slide-in-from-bottom-2 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tab Headers */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex-shrink-0">
        {(["emoji", "sticker", "gif"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setPickerTab(tab)}
            className={cn(
              "flex-1 pb-2 text-center border-b-2 capitalize transition font-bold",
              pickerTab === tab
                ? "border-primary text-primary"
                : "border-transparent hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Picker Body */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {pickerTab === "emoji" && (
          <div className="flex-1 flex flex-col min-h-0">
            <input
              type="text"
              placeholder="Search Emojis..."
              value={emojiSearch}
              onChange={(e) => setEmojiSearch(e.target.value)}
              className="w-full px-3 py-1.5 mb-2 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white"
            />
            <div className="flex-1 overflow-y-auto custom-scroll pr-1">
              {EMOJI_CATEGORIES.map((cat) => {
                const filtered = cat.list.filter((em) => {
                  if (!emojiSearch) return true;
                  if (cat.label.toLowerCase().includes(emojiSearch.toLowerCase())) return true;
                  if (em === emojiSearch) return true;
                  return EMOJI_SUGGESTIONS.some(
                    (s) => s.val === em && s.key.toLowerCase().includes(emojiSearch.toLowerCase())
                  );
                });
                if (filtered.length === 0) return null;
                return (
                  <div key={cat.label} className="mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      {cat.icon} {cat.label}
                    </span>
                    <div className="grid grid-cols-7 gap-2 text-center text-lg">
                      {filtered.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setMessageText((prev) => prev + emoji);
                            inputRef.current?.focus();
                          }}
                          className="hover:scale-125 transition duration-100"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pickerTab === "sticker" && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-1 pt-1 pb-2 flex-shrink-0">
              <input
                type="text"
                placeholder="Search stickers or emoticons..."
                value={stickerSearch}
                onChange={(e) => setStickerSearch(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white"
              />
            </div>
            {stickerSearch ? (
              <div className="flex-1 overflow-y-auto custom-scroll px-1 pb-3">
                {isSearchingStickers ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    {searchedStickersData?.stickers && searchedStickersData.stickers.length > 0 && (
                      <div className="mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                          Matching Stickers
                        </span>
                        <div className="grid grid-cols-4 gap-2.5">
                          {searchedStickersData.stickers.map((sticker: any) => {
                            const stickerUrl = `${getApiUrl()}/accounts/${accountId}/stickers/documents/${sticker.id}/${sticker.access_hash}/download${getAuthParam()}${sticker.file_reference ? `&file_reference=${sticker.file_reference}` : ""}`;
                            return (
                              <button
                                key={sticker.id}
                                onClick={() => {
                                  sendStickerMutation.mutate({
                                    document_id: sticker.id,
                                    access_hash: sticker.access_hash,
                                    file_reference: sticker.file_reference,
                                  });
                                }}
                                className="aspect-square bg-slate-50 dark:bg-[#202b36]/20 rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition border border-slate-150 dark:border-none p-1 flex items-center justify-center cursor-pointer"
                              >
                                <img src={stickerUrl} className="w-full h-full object-contain" loading="lazy" alt="" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {searchedStickersData?.sets && searchedStickersData.sets.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                          Matching Sticker Packs
                        </span>
                        <div className="flex flex-col gap-2">
                          {searchedStickersData.sets.map((set: any) => (
                            <button
                              key={set.set_id}
                              onClick={() => {
                                setStickerSearch("");
                                setSelectedStickerSet(set.short_name);
                              }}
                              className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-[#202b36]/40 hover:bg-slate-100 dark:hover:bg-[#202b36]/80 text-left border border-slate-100 dark:border-slate-800 transition cursor-pointer"
                            >
                              {set.stickers && set.stickers.length > 0 ? (
                                <img
                                  src={`${getApiUrl()}/accounts/${accountId}/stickers/documents/${set.stickers[0].id}/${set.stickers[0].access_hash}/download${getAuthParam()}&file_reference=${set.stickers[0].file_reference}`}
                                  className="w-10 h-10 object-contain"
                                  alt=""
                                />
                              ) : (
                                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center text-xs">📦</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold truncate text-slate-800 dark:text-slate-200">{set.title}</div>
                                <div className="text-[10px] text-slate-400">@{set.short_name}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {(!searchedStickersData?.stickers || searchedStickersData.stickers.length === 0) &&
                     (!searchedStickersData?.sets || searchedStickersData.sets.length === 0) && (
                      <div className="text-center py-8 text-xs text-slate-400">
                        No stickers or packs found
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {stickerSetsData && stickerSetsData.length > 0 ? (
                  <>
                    <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-100 dark:border-slate-800/80 mb-2 scrollbar-none flex-shrink-0 px-1">
                      {stickerSetsData.map((pack: any) => (
                        <button
                          key={pack.id}
                          onClick={() => setSelectedStickerSet(pack.short_name)}
                          className={cn(
                            "px-2.5 py-1 text-[10px] font-bold rounded-lg border flex-shrink-0 transition",
                            selectedStickerSet === pack.short_name
                              ? "bg-primary border-primary text-white"
                              : "bg-slate-50 dark:bg-[#202b36] border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                          )}
                        >
                          {pack.title}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scroll px-1">
                      {isLoadingStickers ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : stickerSetDetails && stickerSetDetails.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2.5">
                          {stickerSetDetails.map((sticker: any) => {
                            const stickerUrl = `${getApiUrl()}/accounts/${accountId}/stickers/documents/${sticker.id}/${sticker.access_hash}/download${getAuthParam()}${sticker.file_reference ? `&file_reference=${sticker.file_reference}` : ""}`;
                            return (
                              <button
                                key={sticker.id}
                                onClick={() => {
                                  sendStickerMutation.mutate({
                                    document_id: sticker.id,
                                    access_hash: sticker.access_hash,
                                    file_reference: sticker.file_reference,
                                  });
                                }}
                                className="aspect-square bg-slate-50 dark:bg-[#202b36]/20 rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition border border-slate-150 dark:border-none p-1 flex items-center justify-center cursor-pointer"
                              >
                                <img
                                  src={stickerUrl}
                                  className="w-full h-full object-contain"
                                  loading="lazy"
                                  alt=""
                                />
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-xs text-slate-400">
                          No stickers in this pack
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No sticker packs installed
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {pickerTab === "gif" && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-1 pt-1 pb-2 flex-shrink-0">
              <input
                type="text"
                placeholder="Search GIFs..."
                value={gifSearch}
                onChange={(e) => setGifSearch(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#202b36] rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 dark:text-white"
              />
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll px-1 pb-3">
              {isSearchingGifs ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {(gifSearch ? searchedGifsData : savedGifsData)?.map((gif: any) => {
                    const gifUrl = `${getApiUrl()}/accounts/${accountId}/gifs/documents/${gif.id}/${gif.access_hash}/download${getAuthParam()}${gif.file_reference ? `&file_reference=${gif.file_reference}` : ""}`;
                    const isSaved = savedGifsData?.some((sg: any) => sg.id === gif.id);
                    return (
                      <div
                        key={gif.id}
                        className="aspect-[4/3] rounded-xl overflow-hidden hover:opacity-95 active:scale-95 transition relative bg-slate-100 dark:bg-slate-800 group"
                      >
                        <button
                          onClick={() => handleSendGif(gif)}
                          className="w-full h-full cursor-pointer absolute inset-0 z-0"
                        >
                          <video
                            src={gifUrl}
                            className="w-full h-full object-cover"
                            autoPlay
                            loop
                            muted
                            playsInline
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            saveGifMutation.mutate({
                              document_id: gif.id,
                              access_hash: gif.access_hash,
                              unsave: isSaved,
                            });
                          }}
                          className="absolute top-1.5 right-1.5 z-10 p-1 bg-black/40 hover:bg-black/60 rounded-lg transition"
                          title={isSaved ? "Unsave GIF" : "Save GIF"}
                        >
                          {isSaved ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-yellow-500">
                              <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-white">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  {(!(gifSearch ? searchedGifsData : savedGifsData) || (gifSearch ? searchedGifsData : savedGifsData).length === 0) && (
                    <div className="col-span-2 text-center py-8 text-xs text-slate-400">
                      {gifSearch ? "No GIFs found" : "No saved GIFs. Search and save some!"}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
