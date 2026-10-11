import { useState, useEffect } from "react";
import { FileText, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

  return (
    <Dialog open={!!lightboxMedia} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto border-none bg-black/90 backdrop-blur-md p-0 shadow-none flex flex-col items-center justify-center select-none text-white [&>button:last-child]:bg-white/10 [&>button:last-child]:hover:bg-white/20 [&>button:last-child]:text-white [&>button:last-child]:rounded-full [&>button:last-child]:p-2 [&>button:last-child]:top-4 [&>button:last-child]:right-4">
        <DialogHeader className="sr-only">
          <DialogTitle>Media Preview</DialogTitle>
          <DialogDescription>Preview image or video in full screen</DialogDescription>
        </DialogHeader>

        {lightboxMedia && (
          <>
            <a
              href={lightboxMedia.url}
              download
              onClick={(e) => e.stopPropagation()}
              className="absolute top-4 right-16 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-50 shadow-md flex items-center justify-center"
              title="Download"
            >
              <FileText className="h-5 w-5" />
            </a>

            {currentMediaIndex > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate("prev");
                }}
                className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-50 shadow-md"
                title="Previous"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
            )}

            {currentMediaIndex !== -1 && currentMediaIndex < mediaListLength - 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate("next");
                }}
                className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 z-50 shadow-md"
                title="Next"
              >
                <ChevronRight className="h-7 w-7" />
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
