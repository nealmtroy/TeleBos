import { useState, useEffect } from "react";
import { X, FileText, ChevronLeft, ChevronRight } from "lucide-react";

interface LightboxModalProps {
  lightboxMedia: { url: string; type: "photo" | "video" } | null;
  onClose: () => void;
  currentMediaIndex: number;
  mediaListLength: number;
  onNavigate: (dir: "prev" | "next") => void;
}

export function LightboxModal({
  lightboxMedia,
  onClose,
  currentMediaIndex,
  mediaListLength,
  onNavigate,
}: LightboxModalProps) {
  const [zoomLevel, setZoomLevel] = useState(1);

  // Reset zoom when media changes
  useEffect(() => {
    setZoomLevel(1);
  }, [lightboxMedia]);

  if (!lightboxMedia) return null;

  return (
    <div
      className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center animate-in fade-in-0 duration-200 select-none"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-55 shadow-md"
      >
        <X className="h-6 w-6" />
      </button>
      
      <a
        href={lightboxMedia.url}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 right-20 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-55 shadow-md flex items-center justify-center"
        title="Download"
      >
        <FileText className="h-6 w-6" />
      </a>

      {currentMediaIndex > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("prev");
          }}
          className="absolute left-4 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-50 shadow-md"
          title="Previous"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}

      {currentMediaIndex !== -1 && currentMediaIndex < mediaListLength - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("next");
          }}
          className="absolute right-4 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-50 shadow-md"
          title="Next"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      <div
        className="relative max-w-[85vw] max-h-[80vh] flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {lightboxMedia.type === "photo" ? (
          <img
            src={lightboxMedia.url}
            onWheel={(e) => {
              e.stopPropagation();
              if (e.deltaY < 0) {
                setZoomLevel((prev) => Math.min(prev + 0.25, 4));
              } else {
                setZoomLevel((prev) => Math.max(prev - 0.25, 1));
              }
            }}
            style={{
              transform: `scale(${zoomLevel})`,
              transition: "transform 0.1s ease-out",
              cursor: zoomLevel > 1 ? "zoom-out" : "zoom-in",
            }}
            onClick={() => {
              if (zoomLevel > 1) setZoomLevel(1);
              else setZoomLevel(2);
            }}
            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
            alt="Fullscreen View"
          />
        ) : (
          <video
            src={lightboxMedia.url}
            controls
            autoPlay
            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
          />
        )}
      </div>
    </div>
  );
}
