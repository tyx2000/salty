import {
  useCallback,
  useEffect,
  useRef,
  type UIEvent,
} from "react";
import type { ChatAttachment, ChatMessage } from "@/types/domain";
import { encryptedAttachmentToDataUrl } from "@/lib/messages";
import type { UnlockedVault } from "@/lib/vault";

/** Options for the message scroll container and attachment preview hook. */
type UseMessageViewportOptions = {
  /** Whether a request is active; changes can trigger a layout settle scroll. */
  busy: boolean;
  /** Active conversation id used to decrypt attachment previews. */
  conversationId: string | null;
  /** Whether the conversation catalog is still loading. */
  loadingConversations: boolean;
  /** Whether message loading is in progress. */
  loadingMessages: boolean;
  /** Rendered messages; changes drive auto-scroll and resize observation. */
  messages: ChatMessage[];
  /** Unlocked encryption vault used for attachment preview decryption. */
  vault: UnlockedVault;
};

/**
 * Manages the message scroll container, near-bottom auto-scroll behavior, and
 * encrypted attachment preview loading for rendered chat messages.
 */
export function useMessageViewport({
  busy,
  conversationId,
  loadingConversations,
  loadingMessages,
  messages,
  vault,
}: UseMessageViewportOptions) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  const handleMessagesScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    autoScrollRef.current = distanceFromBottom < 96;
  }, []);

  const scrollMessagesToEnd = useCallback(() => {
    const node = messagesRef.current;
    if (!node || !autoScrollRef.current) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "instant" });
  }, []);

  const resetAutoScroll = useCallback(() => {
    autoScrollRef.current = true;
  }, []);

  useEffect(() => {
    const node = messagesRef.current;
    if (
      !node ||
      loadingConversations ||
      loadingMessages ||
      messages.length === 0
    ) {
      return;
    }

    autoScrollRef.current = true;
    let cancelled = false;
    let frame = 0;
    let timeout: number | undefined;

    const scrollToBottom = () => {
      node.scrollTop = node.scrollHeight;
    };

    const settleScroll = (remainingFrames: number) => {
      frame = requestAnimationFrame(() => {
        if (cancelled) return;

        scrollToBottom();
        if (remainingFrames > 0) {
          settleScroll(remainingFrames - 1);
        } else {
          timeout = window.setTimeout(scrollToBottom, 80);
        }
      });
    };

    settleScroll(2);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [
    conversationId,
    loadingConversations,
    loadingMessages,
    messages.length,
  ]);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;

    const scrollToEnd = (behavior: ScrollBehavior = "instant") => {
      if (!autoScrollRef.current) return;
      if (behavior === "instant") {
        node.scrollTop = node.scrollHeight;
      } else {
        node.scrollTo({ top: node.scrollHeight, behavior });
      }
    };

    // Instant scroll on content changes avoids racing with scroll animations
    // while streaming text and image previews are still changing layout.
    scrollToEnd("instant");

    const observer = new ResizeObserver(() => scrollToEnd("instant"));
    observer.observe(node);

    return () => observer.disconnect();
  }, [messages, busy, loadingMessages]);

  const loadAttachmentPreview = useCallback(
    (attachment: ChatAttachment) => {
      if (!conversationId) return Promise.reject(new Error("Conversation is not ready."));
      return encryptedAttachmentToDataUrl(vault, conversationId, attachment).then(
        (url) => {
          requestAnimationFrame(() => scrollMessagesToEnd());
          return url;
        },
      );
    },
    [conversationId, scrollMessagesToEnd, vault],
  );

  return {
    autoScrollRef,
    handleMessagesScroll,
    loadAttachmentPreview,
    messagesRef,
    resetAutoScroll,
  };
}
