import { useState, useRef, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FileText, Pause, Play } from "lucide-react";

export function MessagePhoto({
  messageId,
  accountId,
  chatId,
  placeholder,
  getApiUrl,
  onOpenLightbox,
}: {
  messageId: number;
  accountId: string;
  chatId: number;
  placeholder?: string | null;
  getApiUrl: () => string;
  onOpenLightbox: (url: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const mediaUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/media`;

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-100/50 border border-slate-200/40 max-w-[280px] sm:max-w-[320px] aspect-[4/3] cursor-pointer hover:opacity-95 transition">
      {placeholder && (
        <img
          src={placeholder}
          className={cn(
            "absolute inset-0 w-full h-full object-cover blur-md scale-105 transition-opacity duration-500",
            loaded ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
          alt=""
        />
      )}
      <img
        src={mediaUrl}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          "w-full h-full object-cover transition-all duration-500 ease-out",
          loaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
        onClick={() => onOpenLightbox(mediaUrl)}
        alt="Photo Attachment"
      />
    </div>
  );
}

export function MessageVideo({
  messageId,
  accountId,
  chatId,
  poster,
  getApiUrl,
}: {
  messageId: number;
  accountId: string;
  chatId: number;
  poster?: string | null;
  getApiUrl: () => string;
}) {
  const streamUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/video/stream`;
  return (
    <div className="relative rounded-xl overflow-hidden bg-slate-950 max-w-[280px] sm:max-w-[320px] border border-slate-200/10">
      <video
        src={streamUrl}
        poster={poster || undefined}
        controls
        preload="metadata"
        className="w-full max-h-[240px] rounded-xl"
        playsInline
      />
    </div>
  );
}

export function MessageVideoNote({
  messageId,
  accountId,
  chatId,
  getApiUrl,
}: {
  messageId: number;
  accountId: string;
  chatId: number;
  getApiUrl: () => string;
}) {
  const streamUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/video/stream`;
  return (
    <div className="relative rounded-full overflow-hidden bg-slate-950 w-44 h-44 border-2 border-primary/20 aspect-square">
      <video
        src={streamUrl}
        controls
        loop
        muted
        preload="metadata"
        className="w-full h-full object-cover rounded-full"
        playsInline
      />
    </div>
  );
}

export function MessageVoice({
  messageId,
  accountId,
  chatId,
  waveform,
  getApiUrl,
  isOut,
}: {
  messageId: number;
  accountId: string;
  chatId: number;
  waveform: number[];
  getApiUrl: () => string;
  isOut: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/media`;

  const bars = useMemo(() => {
    if (waveform && waveform.length > 0) return waveform;
    return Array.from({ length: 45 }, (_, i) => Math.abs(Math.sin(i * 0.2)) * 18 + 2);
  }, [waveform]);

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(mediaUrl);
      audioRef.current.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
          const cur = audioRef.current.currentTime;
          const dur = audioRef.current.duration || 1;
          setProgress(cur / dur);
        }
      };
    }

    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
    setPlaying(!playing);
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <div className={cn(
      "flex items-center gap-3 py-1.5 px-2.5 rounded-xl min-w-[200px] max-w-[280px]",
      isOut ? "bg-black/10 text-white" : "bg-slate-50 text-slate-800 border border-slate-100"
    )}>
      <button
        onClick={togglePlay}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-95 shadow-sm",
          isOut ? "bg-white text-primary" : "bg-primary text-primary-foreground"
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
      </button>
      
      <div
        className="flex-1 flex items-end gap-[1.5px] h-6 select-none cursor-pointer"
        onClick={(e) => {
          if (audioRef.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, clickX / rect.width));
            const targetTime = percentage * (audioRef.current.duration || 0);
            if (isFinite(targetTime)) {
              audioRef.current.currentTime = targetTime;
              setProgress(percentage);
            }
          }
        }}
      >
        {bars.map((val, idx) => {
          const isActive = idx / bars.length <= progress;
          return (
            <span
              key={idx}
              className="w-[2px] rounded-full transition-colors duration-100"
              style={{
                height: `${Math.max(12, (val / 31) * 100)}%`,
                backgroundColor: isActive
                  ? (isOut ? "#ffffff" : "var(--primary)")
                  : (isOut ? "rgba(255,255,255,0.3)" : "#cbd5e1")
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function MessageSticker({
  messageId,
  accountId,
  chatId,
  getApiUrl,
}: {
  messageId: number;
  accountId: string;
  chatId: number;
  getApiUrl: () => string;
}) {
  const mediaUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/media`;
  return (
    <div className="w-32 h-32 select-none hover:scale-105 transition duration-200">
      <img
        src={mediaUrl}
        loading="lazy"
        className="w-full h-full object-contain"
        alt="Sticker"
      />
    </div>
  );
}

export function MessageDocument({
  messageId,
  accountId,
  chatId,
  filename,
  fileSize,
  getApiUrl,
  isOut,
}: {
  messageId: number;
  accountId: string;
  chatId: number;
  filename: string;
  fileSize?: number | null;
  getApiUrl: () => string;
  isOut: boolean;
}) {
  const downloadUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/media`;
  
  const sizeText = useMemo(() => {
    if (!fileSize) return "";
    if (fileSize < 1024) return `${fileSize} B`;
    if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`;
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }, [fileSize]);

  return (
    <a
      href={downloadUrl}
      download={filename}
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-xl border max-w-[280px] transition text-left cursor-pointer active:scale-98 select-none group",
        isOut
          ? "bg-black/10 border-white/10 hover:bg-black/20 text-white"
          : "bg-slate-50 border-slate-200/60 hover:bg-slate-100 text-slate-800"
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-xs uppercase shadow-sm transition group-hover:scale-105",
        isOut ? "bg-white text-primary" : "bg-primary text-primary-foreground"
      )}>
        <FileText className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate leading-snug">{filename}</p>
        {sizeText && <p className={cn(
          "text-[10px] mt-0.5 font-medium",
          isOut ? "text-primary-100" : "text-slate-400"
        )}>{sizeText}</p>}
      </div>
    </a>
  );
}
