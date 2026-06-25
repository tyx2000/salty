import { useEffect, useState } from "react";
import type { ChatAttachment, MessagePart } from "@/types/domain";
import { FileText } from "lucide-react";
import { MarkdownMessage } from "./MarkdownMessage";

type MessagePartRendererProps = {
  attachments?: Record<string, ChatAttachment>;
  loadAttachmentPreview?: (attachment: ChatAttachment) => Promise<string>;
  part: MessagePart;
};

export function MessagePartRenderer({
  attachments,
  loadAttachmentPreview,
  part,
}: MessagePartRendererProps) {
  if (part.type === "text" || part.type === "markdown") {
    return <MarkdownMessage content={part.text} />;
  }

  if (part.type === "image" || part.type === "file") {
    const attachment = attachments?.[part.attachmentId];
    return (
      <AttachmentPreview
        attachment={attachment}
        loadAttachmentPreview={loadAttachmentPreview}
      />
    );
  }

  if (part.type === "json") {
    return (
      <pre className="json-part">
        {JSON.stringify(part.value, null, 2)}
      </pre>
    );
  }

  if (part.type === "tool_call") {
    return (
      <pre className="json-part">
        {JSON.stringify({ tool: part.name, arguments: part.arguments }, null, 2)}
      </pre>
    );
  }

  return (
    <pre className="json-part">
      {JSON.stringify({ tool: part.name, result: part.result }, null, 2)}
    </pre>
  );
}

type AttachmentPreviewProps = {
  attachment?: ChatAttachment;
  loadAttachmentPreview?: (attachment: ChatAttachment) => Promise<string>;
};

function AttachmentPreview({
  attachment,
  loadAttachmentPreview,
}: AttachmentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState(attachment?.dataUrl);
  const [previewFailed, setPreviewFailed] = useState(false);
  const isImage = attachment?.mimeType.startsWith("image/");
  const [imageReady, setImageReady] = useState(Boolean(attachment?.dataUrl));

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(attachment?.dataUrl);
    setPreviewFailed(false);
    setImageReady(Boolean(attachment?.dataUrl));

    if (!attachment || !isImage || attachment.dataUrl || !loadAttachmentPreview) {
      return () => {
        cancelled = true;
      };
    }

    loadAttachmentPreview(attachment)
      .then((url) => {
        if (!cancelled) {
          setPreviewUrl(url);
          // Let the image decode before crossfading.
          const preload = new Image();
          preload.src = url;
          preload.decode().then(() => {
            if (!cancelled) setImageReady(true);
          }).catch(() => {
            if (!cancelled) setImageReady(true);
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [attachment, isImage, loadAttachmentPreview]);

  if (!isImage) {
    return (
      <div className="attachment-card">
        <FileText size={16} />
        <div className="attachment-meta">
          <strong>{attachment?.fileName ?? "Encrypted attachment"}</strong>
          <span>{attachment?.mimeType ?? "application/octet-stream"}</span>
        </div>
        {previewUrl ? (
          <a
            className="attachment-download"
            download={attachment?.fileName ?? "attachment"}
            href={previewUrl}
          >
            Download
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="attachment-card image-card">
      <div className="image-preview-frame">
        <img
          alt={attachment?.fileName ?? "Attachment image"}
          className={`attachment-image${imageReady ? " loaded" : ""}`}
          src={previewUrl || undefined}
        />
        {!imageReady && (
          <div className="attachment-image-placeholder">
            {previewFailed ? "Image preview unavailable" : "Loading image..."}
          </div>
        )}
      </div>
    </div>
  );
}
