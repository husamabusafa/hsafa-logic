import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { XIcon } from "lucide-react";

interface ImageMessageProps {
  message: MockMessage;
}

export function ImageMessage({ message }: ImageMessageProps) {
  const [lightbox, setLightbox] = useState(false);

  // Show content text if present and different from caption
  const hasText = message.content && message.content.trim() && message.content !== message.imageCaption;

  return (
    <>
      <div className="space-y-1">
        {hasText && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed break-words mb-1.5">
            {message.content}
          </p>
        )}
        <button
          onClick={() => setLightbox(true)}
          className="block rounded-lg overflow-hidden max-w-sm cursor-zoom-in"
        >
          <img
            src={message.imageUrl}
            alt={message.imageCaption || "Image"}
            className="w-full h-auto max-h-64 object-cover rounded-lg"
            loading="lazy"
          />
        </button>
        {message.imageCaption && !hasText && (
          <p className="text-sm leading-relaxed">{message.imageCaption}</p>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
          >
            <XIcon className="size-6" />
          </button>
          <img
            src={message.imageUrl}
            alt={message.imageCaption || "Image"}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}
