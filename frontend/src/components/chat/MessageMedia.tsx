import { useState, useRef, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getAuthParam } from "./helpers";
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
  const [error, setError] = useState(false);
  const mediaUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/media${getAuthParam()}`;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 w-[240px] aspect-[4/3] p-4 text-center select-none">
        <svg className="h-8 w-8 text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-[11px] font-semibold text-slate-500">Expired or unavailable photo</p>
      </div>
    );
  }

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
        onError={() => setError(true)}
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
  const [error, setError] = useState(false);
  const streamUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/video/stream${getAuthParam()}`;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 w-[240px] aspect-[4/3] p-4 text-center select-none">
        <svg className="h-8 w-8 text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p className="text-[11px] font-semibold text-slate-500">Expired or unavailable video</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-slate-950 max-w-[280px] sm:max-w-[320px] border border-slate-200/10">
      <video
        src={streamUrl}
        poster={poster || undefined}
        controls
        preload="metadata"
        onError={() => setError(true)}
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
  const [error, setError] = useState(false);
  const streamUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/video/stream${getAuthParam()}`;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/60 w-44 h-44 p-4 text-center select-none text-xs text-slate-500 font-semibold">
        Expired Video Note
      </div>
    );
  }

  return (
    <div className="relative rounded-full overflow-hidden bg-slate-950 w-44 h-44 border-2 border-primary/20 aspect-square">
      <video
        src={streamUrl}
        controls
        loop
        muted
        preload="metadata"
        onError={() => setError(true)}
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
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/media${getAuthParam()}`;

  const bars = useMemo(() => {
    if (waveform && waveform.length > 0) return waveform;
    return Array.from({ length: 45 }, (_, i) => Math.abs(Math.sin(i * 0.2)) * 18 + 2);
  }, [waveform]);

  const togglePlay = () => {
    if (error) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(mediaUrl);
      audioRef.current.onerror = () => {
        setError(true);
        setPlaying(false);
      };
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
      isOut ? "bg-black/10 text-white" : "bg-slate-50 text-slate-800 border border-slate-100",
      error && "opacity-60"
    )}>
      <button
        onClick={togglePlay}
        disabled={error}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-95 shadow-sm",
          isOut ? "bg-white text-primary" : "bg-primary text-primary-foreground",
          error && "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
        )}
      >
        {error ? (
          <span className="text-[10px] font-bold">!</span>
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 fill-current" />
        )}
      </button>
      {error && (
        <span className="text-[10px] font-semibold text-slate-400 italic">Voice expired</span>
      )}
      
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
  const [error, setError] = useState(false);
  const mediaUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/media${getAuthParam()}`;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-850/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg w-28 h-28 p-2 text-center select-none text-[10px] text-slate-400 font-medium">
        Sticker expired
      </div>
    );
  }

  return (
    <div className="w-32 h-32 select-none hover:scale-105 transition duration-200">
      <img
        src={mediaUrl}
        loading="lazy"
        onError={() => setError(true)}
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
  const downloadUrl = `${getApiUrl()}/accounts/${accountId}/chats/${chatId}/messages/${messageId}/media${getAuthParam()}`;
  
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
