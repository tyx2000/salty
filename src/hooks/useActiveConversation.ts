import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import type { ChatMessage } from "@/types/domain";
import { loadMessages } from "@/lib/messages";
import { settleInterruptedAssistantMessages } from "@/lib/messageSettlement";
import type { UnlockedVault } from "@/lib/vault";

/** Options for the active conversation state and route synchronization hook. */
type UseActiveConversationOptions = {
  /** Mutable busy flag used to avoid settling interrupted messages mid-stream. */
  busyRef: { current: boolean };
  /** True when the current route is a settings page and chat route sync should pause. */
  isSettingsRoute: boolean;
  /** Receives load/decryption errors for display in the chat notice area. */
  onError: (message: string | null) => void;
  /** Conversation id parsed from the current chat route. */
  routeConversationId: string | null;
  /** Unlocked encryption vault used to load and settle messages. */
  vault: UnlockedVault;
};

/**
 * Owns the active conversation id, decrypted message list, and route-driven
 * conversation loading. It keeps settings pages from resetting chat state.
 */
export function useActiveConversation({
  busyRef,
  isSettingsRoute,
  onError,
  routeConversationId,
  vault,
}: UseActiveConversationOptions) {
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const loadRequestRef = useRef(0);
  const openingConversationRef = useRef<string | null>(null);

  const startNewConversation = useCallback(
    (updateRoute = true) => {
      loadRequestRef.current += 1;
      openingConversationRef.current = null;
      if (updateRoute) navigate("/");
      setConversationId(null);
      setMessages([]);
      setLoadingMessages(false);
      onError(null);
    },
    [navigate, onError],
  );

  const openConversation = useCallback(
    async (nextConversationId: string, updateRoute = true) => {
      if (conversationId === nextConversationId) {
        if (updateRoute) navigate(`/chat/${encodeURIComponent(nextConversationId)}`);
        return;
      }
      if (openingConversationRef.current === nextConversationId) return;

      const loadRequestId = loadRequestRef.current + 1;
      loadRequestRef.current = loadRequestId;
      openingConversationRef.current = nextConversationId;
      if (updateRoute) navigate(`/chat/${encodeURIComponent(nextConversationId)}`);
      setConversationId(nextConversationId);
      setLoadingMessages(true);
      onError(null);

      try {
        const loadedMessages = await loadMessages(vault, nextConversationId);
        const settledMessages =
          busyRef.current
            ? loadedMessages
            : await settleInterruptedAssistantMessages(
                vault,
                loadedMessages,
                nextConversationId,
              );
        if (
          loadRequestRef.current !== loadRequestId ||
          openingConversationRef.current !== nextConversationId
        ) {
          return;
        }
        setMessages(settledMessages);
      } catch (unknownError) {
        if (
          loadRequestRef.current !== loadRequestId ||
          openingConversationRef.current !== nextConversationId
        ) {
          return;
        }
        onError(
          unknownError instanceof Error
            ? unknownError.message
            : "Unable to load messages.",
        );
      } finally {
        if (
          loadRequestRef.current === loadRequestId &&
          openingConversationRef.current === nextConversationId
        ) {
          openingConversationRef.current = null;
          setLoadingMessages(false);
        }
      }
    },
    [busyRef, conversationId, navigate, onError, vault],
  );

  useEffect(() => {
    if (isSettingsRoute) return;
    if (busyRef.current) return;

    if (routeConversationId) {
      void openConversation(routeConversationId, false);
      return;
    }

    startNewConversation(false);
  }, [
    busyRef,
    isSettingsRoute,
    openConversation,
    routeConversationId,
    startNewConversation,
    vault,
  ]);

  return {
    conversationId,
    loadingMessages,
    messages,
    openConversation,
    setConversationId,
    setMessages,
    startNewConversation,
  };
}
