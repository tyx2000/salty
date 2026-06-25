import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { SharedSnapshot } from "@/types/domain";
import { env } from "@/lib/env";
import { loadSharedSnapshot, type ShareKind } from "@/lib/shares";
import { MessagePartRenderer } from "./MessagePartRenderer";

type ShareViewerProps = {
  kind: ShareKind;
  token: string;
};

export function ShareViewer({ kind, token }: ShareViewerProps) {
  const [snapshot, setSnapshot] = useState<SharedSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadShare() {
      setLoading(true);
      setError(null);

      try {
        const secret = window.location.hash.slice(1);
        if (!secret) throw new Error("This share link is missing its decrypt key.");
        const nextSnapshot = await loadSharedSnapshot(kind, token, secret);
        if (!cancelled) setSnapshot(nextSnapshot);
      } catch (unknownError) {
        if (!cancelled) {
          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "Unable to open this share link.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadShare();

    return () => {
      cancelled = true;
    };
  }, [kind, token]);

  return (
    <section className="share-page">
      <header className="share-header">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={20} />
          </div>
          <div>
            <strong>{env.appName}</strong>
            <span>Shared encrypted chat</span>
          </div>
        </div>
      </header>

      <div className="share-content">
        {loading ? (
          <div className="empty-state">
            <h1>Opening share</h1>
            <p>Decrypting this snapshot in your browser.</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <h1>Share unavailable</h1>
            <p>{error}</p>
          </div>
        ) : snapshot ? (
          <>
            <div className="share-title">
              <span>{snapshot.kind === "conversation" ? "Conversation" : "Message and response"}</span>
              <h1>{snapshot.title}</h1>
            </div>
            <div className="share-messages">
              {snapshot.messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <span>{message.role}</span>
                  <div
                    className={
                      messageHasAttachmentsAndBody(message.parts)
                        ? "message-content with-divider"
                        : "message-content"
                    }
                  >
                    {orderedMessageParts(message.parts).map((part, index) => (
                      <MessagePartRenderer
                        attachments={message.attachments}
                        key={`${message.id}:${index}`}
                        part={part}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function orderedMessageParts(parts: SharedSnapshot["messages"][number]["parts"]) {
  const attachments = parts.filter(
    (part) => part.type === "image" || part.type === "file",
  );
  const rest = parts.filter((part) => part.type !== "image" && part.type !== "file");
  return [...attachments, ...rest];
}

function messageHasAttachmentsAndBody(parts: SharedSnapshot["messages"][number]["parts"]) {
  const hasAttachment = parts.some(
    (part) => part.type === "image" || part.type === "file",
  );
  const hasBody = parts.some((part) => {
    if (part.type === "image" || part.type === "file") return false;
    if (part.type === "text" || part.type === "markdown") {
      return part.text.trim().length > 0;
    }
    return true;
  });
  return hasAttachment && hasBody;
}
