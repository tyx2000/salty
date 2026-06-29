import { X } from "lucide-react";

/** Props for pending file chips shown above the composer textarea. */
type PendingAttachmentsProps = {
  /** Files queued for the next user message. */
  files: File[];
  /** Removes a queued file by its chip index. */
  onRemove: (index: number) => void;
};

/** Displays selected files before they are uploaded with a message. */
export function PendingAttachments({
  files,
  onRemove,
}: PendingAttachmentsProps) {
  if (files.length === 0) return null;

  return (
    <div className="pending-attachments">
      {files.map((file, index) => (
        <div className="pending-attachment" key={`${file.name}:${file.size}:${index}`}>
          <span>{file.name}</span>
          <button
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(index)}
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
