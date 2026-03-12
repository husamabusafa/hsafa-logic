import { type MockMessage } from "@/lib/mock-data";
import { FileIcon, FileTextIcon, ImageIcon, FileSpreadsheetIcon, FileArchiveIcon, DownloadIcon } from "lucide-react";

interface FileMessageProps {
  message: MockMessage;
}

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

export function FileMessage({ message }: FileMessageProps) {
  const Icon = getFileIcon(message.fileMimeType);
  const color = getFileColor(message.fileMimeType);

  return (
    <div className="flex items-center gap-3 p-1">
      <div className="size-10 rounded-lg bg-muted/80 flex items-center justify-center shrink-0">
        <Icon className={`size-5 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{message.fileName || "file"}</p>
        <p className="text-[11px] text-muted-foreground">
          {message.fileSize ? formatFileSize(message.fileSize) : "Unknown size"}
        </p>
      </div>
      <button className="size-8 rounded-lg hover:bg-muted/80 flex items-center justify-center shrink-0 transition-colors">
        <DownloadIcon className="size-4 text-muted-foreground" />
      </button>
    </div>
  );
}
