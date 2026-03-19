import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { FileIcon, FileTextIcon, ImageIcon, FileSpreadsheetIcon, FileArchiveIcon, DownloadIcon, XIcon, PlayCircleIcon } from "lucide-react";

type Attachment = NonNullable<MockMessage["attachments"]>[number];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType?: string) {
  if (!mimeType) return FileIcon;
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.includes("pdf") || mimeType.includes("text")) return FileTextIcon;
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) return FileSpreadsheetIcon;
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) return FileArchiveIcon;
  return FileIcon;
}

function getFileColor(mimeType?: string): string {
  if (!mimeType) return "text-muted-foreground";
  if (mimeType.includes("pdf")) return "text-red-500";
  if (mimeType.startsWith("image/")) return "text-blue-500";
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) return "text-emerald-500";
  if (mimeType.includes("word") || mimeType.includes("document")) return "text-blue-600";
  if (mimeType.includes("zip") || mimeType.includes("archive")) return "text-amber-500";
  return "text-muted-foreground";
}

function ImageAttachment({ attachment, onClick }: { attachment: Attachment; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block rounded-lg overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity"
    >
      <img
        src={attachment.url}
        alt={attachment.fileName}
        className="w-full h-auto max-h-48 object-cover rounded-lg"
        loading="lazy"
      />
    </button>
  );
}

function VideoAttachment({ attachment }: { attachment: Attachment }) {
  return (
    <div className="relative rounded-lg overflow-hidden bg-black/5">
      {attachment.thumbnailUrl ? (
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block relative group">
          <img
            src={attachment.thumbnailUrl}
            alt={attachment.fileName}
            className="w-full h-auto max-h-48 object-cover rounded-lg"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <PlayCircleIcon className="size-10 text-white drop-shadow-lg" />
          </div>
        </a>
      ) : (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors"
        >
          <div className="size-10 rounded-lg bg-muted/80 flex items-center justify-center shrink-0">
            <PlayCircleIcon className="size-5 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{attachment.fileName}</p>
            <p className="text-[11px] text-muted-foreground">
              {attachment.fileSize ? formatFileSize(attachment.fileSize) : "Video"}
            </p>
          </div>
        </a>
      )}
    </div>
  );
}

function FileAttachment({ attachment }: { attachment: Attachment }) {
  const Icon = getFileIcon(attachment.fileMimeType);
  const color = getFileColor(attachment.fileMimeType);

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
    >
      <div className="size-9 rounded-lg bg-muted/80 flex items-center justify-center shrink-0">
        <Icon className={`size-4.5 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{attachment.fileName}</p>
        <p className="text-[11px] text-muted-foreground">
          {attachment.fileSize ? formatFileSize(attachment.fileSize) : "Unknown size"}
        </p>
      </div>
      <DownloadIcon className="size-3.5 text-muted-foreground shrink-0" />
    </a>
  );
}

interface AttachmentsRendererProps {
  message: MockMessage;
}

export function AttachmentsRenderer({ message }: AttachmentsRendererProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const attachments = message.attachments;
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.type === "image");
  const videos = attachments.filter((a) => a.type === "video");
  const files = attachments.filter((a) => a.type === "file");

  return (
    <div className="space-y-2">
      {/* Text content */}
      {message.content && message.content.trim() && (
        <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">
          {message.content.split(/(\*\*.*?\*\*)/).map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={i}>{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
        </p>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div className={`grid gap-1.5 ${
          images.length === 1 ? "grid-cols-1" :
          images.length === 2 ? "grid-cols-2" :
          images.length === 3 ? "grid-cols-2" :
          "grid-cols-2"
        }`}>
          {images.map((img, i) => (
            <div key={i} className={images.length === 3 && i === 0 ? "col-span-2" : ""}>
              <ImageAttachment
                attachment={img}
                onClick={() => setLightboxUrl(img.url)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div className="space-y-1.5">
          {videos.map((vid, i) => (
            <VideoAttachment key={i} attachment={vid} />
          ))}
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file, i) => (
            <FileAttachment key={i} attachment={file} />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
          >
            <XIcon className="size-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
