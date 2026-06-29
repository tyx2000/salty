import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type {
  ChatAttachment,
  ChatMessage,
  ChatResponseStats,
  MessagePart,
  ProviderId,
  ProviderKeyState,
  ReasoningEffort,
  ThinkingMode,
} from "@/types/domain";
import {
  createConversation,
  type ConversationListItem,
} from "@/lib/conversations";
import {
  deleteMessages,
  saveMessage,
  updateMessageContent,
} from "@/lib/messages";
import type { PendingAttachment } from "@/lib/messages";
import { streamChat } from "@/lib/chatApi";
import { createAssistantStreamState } from "@/lib/assistantStreamState";
import { createChatTurnDraft } from "@/lib/chatTurnDraft";
import {
  bumpConversation,
  upsertConversation,
} from "@/lib/conversationListUtils";
import { createUsageEventRecorder } from "@/lib/chatUsageRecorder";
import {
  buildStreamMessages,
  createCompletedAssistantMessage,
  resolveTurnConfig,
} from "@/lib/chatTurnFlow";
import { handleEmptyAssistantResponse } from "@/lib/emptyAssistantResponse";
import { safeTouchConversation } from "@/lib/messageSettlement";
import { rollbackFailedTurn } from "@/lib/turnRollback";
import type { UnlockedVault } from "@/lib/vault";

/** Options for sending one user turn to the selected provider. */
export type SendUserTurnOptions = {
  /** Runs after the replacement user/assistant turn is safely persisted. */
  afterTurnSaved?: (userMessage: ChatMessage, assistantMessage: ChatMessage) => Promise<void>;
  /** True when the caller already acquired the shared busy lock. */
  busyLockAcquired?: boolean;
  /** History to send to the model; retries pass history with the old turn removed. */
  historyMessages?: ChatMessage[];
  /** Message parts for the new user message. */
  parts: MessagePart[];
  /** New files selected for upload with this turn. */
  pendingAttachments?: PendingAttachment[];
  /** Existing attachments reused by retry without re-uploading. */
  reusedAttachments?: ChatAttachment[];
  /** Fallback conversation title when a new conversation is created. */
  title: string;
  /** Model to use for this turn; defaults to current composer selection. */
  turnModel?: string;
  /** Provider to use for this turn; defaults to current composer selection. */
  turnProvider?: ProviderId;
};

/** Options for wiring chat sending into the current shell state. */
type UseSendUserTurnOptions = {
  /** Acquires the shared busy lock for normal sends. */
  acquireBusyLock: () => boolean;
  /** Auto-scroll flag updated before streaming starts. */
  autoScrollRef: { current: boolean };
  /** Active conversation id, or null when creating a new conversation. */
  conversationId: string | null;
  /** Current selected model used when a send does not override it. */
  defaultModel: string;
  /** Current selected provider used when a send does not override it. */
  defaultProvider: ProviderId;
  /** Current message history used for normal sends. */
  defaultHistoryMessages: ChatMessage[];
  /** Navigates back to the empty chat route after rollback removes a new conversation. */
  navigateHome: () => void;
  /** Navigates to the active conversation route after a conversation is created. */
  navigateToConversation: (conversationId: string) => void;
  /** Receives send, stream, save, and rollback errors for display. */
  onError: (message: string | null) => void;
  /** Opens provider settings when a configured/tested API key is missing. */
  onOpenProviderSettings: () => void;
  /** Tested provider key state used to resolve API key and model availability. */
  providerKeys: Record<ProviderId, ProviderKeyState>;
  /** Reasoning effort sent to the provider request. */
  reasoningEffort: ReasoningEffort;
  /** Releases the shared busy lock in all terminal paths. */
  releaseBusyLock: () => void;
  /** Stores the active conversation id after creation or rollback. */
  setConversationId: Dispatch<SetStateAction<string | null>>;
  /** Updates the sidebar conversation list after creation or activity. */
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>;
  /** Updates the active timeline as the user message and stream progress change. */
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  /** Thinking mode sent to the provider request. */
  thinkingMode: ThinkingMode;
  /** Unlocked encryption vault used for persistence, uploads, and usage events. */
  vault: UnlockedVault;
};

/**
 * Sends a user turn end to end: validates provider settings, persists messages,
 * streams the assistant response, records usage, and rolls back failed partial
 * writes without leaving orphaned UI state.
 */
export function useSendUserTurn({
  acquireBusyLock,
  autoScrollRef,
  conversationId,
  defaultHistoryMessages,
  defaultModel,
  defaultProvider,
  navigateHome,
  navigateToConversation,
  onError,
  onOpenProviderSettings,
  providerKeys,
  reasoningEffort,
  releaseBusyLock,
  setConversationId,
  setConversations,
  setMessages,
  thinkingMode,
  vault,
}: UseSendUserTurnOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const statsTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (statsTimerRef.current !== undefined) {
        window.clearInterval(statsTimerRef.current);
        statsTimerRef.current = undefined;
      }
    };
  }, []);

  function stopResponse() {
    abortControllerRef.current?.abort();
  }

  async function sendUserTurn({
    parts,
    pendingAttachments = [],
    reusedAttachments = [],
    title,
    historyMessages = defaultHistoryMessages,
    turnProvider = defaultProvider,
    turnModel = defaultModel,
    afterTurnSaved,
    busyLockAcquired = false,
  }: SendUserTurnOptions) {
    let lockHeld = busyLockAcquired;
    const releaseHeldBusyLock = () => {
      if (!lockHeld) return;
      releaseBusyLock();
      lockHeld = false;
    };

    const turnConfig = resolveTurnConfig({
      model: turnModel,
      pendingAttachments,
      provider: turnProvider,
      providerKeys,
      reusedAttachments,
    });
    if (!turnConfig.ok) {
      releaseHeldBusyLock();
      onError(turnConfig.error);
      if (turnConfig.openProviderSettings) onOpenProviderSettings();
      return false;
    }
    const apiKey = turnConfig.apiKey;
    const resolvedTurnModel = turnConfig.model;

    if (!lockHeld) {
      if (!acquireBusyLock()) return false;
      lockHeld = true;
    }
    onError(null);
    autoScrollRef.current = true;

    let turnDraft: Awaited<ReturnType<typeof createChatTurnDraft>>;
    try {
      turnDraft = await createChatTurnDraft({
        parts,
        pendingAttachments,
        provider: turnProvider,
        reusedAttachments,
        model: resolvedTurnModel,
      });
    } catch (unknownError) {
      onError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to read attachments.",
      );
      releaseHeldBusyLock();
      return false;
    }
    const {
      assistantMessage,
      completedUserMessage,
      requestAttachmentMap,
      userMessage,
    } = turnDraft;

    setMessages([...historyMessages, userMessage]);

    let statsTimer: number | undefined;
    let assistantPersisted = false;
    let userPersisted = false;
    let createdConversationId: string | null = null;
    let assistantContentPersisted = false;
    let latestResponseStats: ChatResponseStats | undefined;
    const usageRecorder = createUsageEventRecorder({
      model: resolvedTurnModel,
      provider: turnProvider,
      vault,
    });

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const isNewConversation = !conversationId;
      const nextConversationId =
        conversationId ??
        (await createConversation(vault, title.slice(0, 80), turnProvider, resolvedTurnModel));
      usageRecorder.setConversationId(nextConversationId);
      if (isNewConversation) createdConversationId = nextConversationId;
      setConversationId(nextConversationId);
      navigateToConversation(nextConversationId);
      setConversations((current) =>
        isNewConversation
          ? upsertConversation(current, {
              id: nextConversationId,
              title: title.slice(0, 80) || "New conversation",
              updatedAt: new Date().toISOString(),
            })
          : bumpConversation(current, nextConversationId),
      );

      await saveMessage(vault, completedUserMessage, nextConversationId, turnProvider, {
        model: resolvedTurnModel,
        pendingAttachments,
      });
      userPersisted = true;
      await saveMessage(vault, assistantMessage, nextConversationId, turnProvider, {
        model: resolvedTurnModel,
      });
      assistantPersisted = true;
      setMessages((current) => [
        ...current.map((message) =>
          message.id === userMessage.id
            ? completedUserMessage
            : message,
        ),
        assistantMessage,
      ]);

      const responseStartedAt = performance.now();
      usageRecorder.start(responseStartedAt);
      const assistantStreamState = createAssistantStreamState({
        assistantMessageId: assistantMessage.id,
        responseStartedAt,
        setMessages,
      });
      statsTimer = assistantStreamState.startStatsTimer();
      statsTimerRef.current = statsTimer;

      const { text: assistantText, stats } = await streamChat({
        provider: turnProvider,
        model: resolvedTurnModel,
        apiKey,
        thinkingMode,
        reasoningEffort,
        messages: buildStreamMessages(
          historyMessages,
          completedUserMessage,
          requestAttachmentMap,
        ),
        signal: abortController.signal,
        onToken: (token) => {
          assistantStreamState.appendToken(token);
        },
        onUsage: (usage) => {
          assistantStreamState.setUsage(usage);
        },
      });
      latestResponseStats = stats;

      const assistantTextHasContent = assistantText.trim().length > 0;
      if (assistantTextHasContent) {
        const completedAssistantMessage = createCompletedAssistantMessage({
          assistantMessage,
          assistantText,
          responseStats: stats,
          wasAborted: abortController.signal.aborted,
        });
        const { cleanupFailed } = await updateMessageContent(
          vault,
          completedAssistantMessage,
          nextConversationId,
          turnProvider,
          { model: resolvedTurnModel },
        );
        assistantContentPersisted = true;
        if (cleanupFailed) {
          onError("Response saved, but old message parts could not be cleaned up.");
        }
        await usageRecorder.record({
          messageId: completedAssistantMessage.id,
          stats,
          success: !abortController.signal.aborted,
          errorCode: abortController.signal.aborted ? "aborted" : undefined,
        });
        try {
          await afterTurnSaved?.(completedUserMessage, completedAssistantMessage);
        } catch {
          onError("Response saved, but the previous retry turn could not be deleted.");
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? completedAssistantMessage
              : message,
          ),
        );
      } else {
        const wasAborted = abortController.signal.aborted;
        await handleEmptyAssistantResponse({
          assistantMessage,
          setMessages,
          userMessage,
          vault,
          wasAborted,
        });
        assistantPersisted = false;
        await usageRecorder.record({
          messageId: userMessage.id,
          stats,
          success: false,
          errorCode: wasAborted ? "aborted" : "empty_response",
        });
        await safeTouchConversation(nextConversationId);
        return true;
      }
      // Skip touchConversation when afterTurnSaved handles the timestamp refresh.
      if (!afterTurnSaved) await safeTouchConversation(nextConversationId);
    } catch (unknownError) {
      onError(
        unknownError instanceof Error
          ? unknownError.message
          : "Chat request failed.",
      );
      await usageRecorder.record({
        messageId: userPersisted ? userMessage.id : null,
        stats: latestResponseStats,
        success: false,
        errorCode: "request_failed",
      });
      await rollbackFailedTurn({
        assistantContentPersisted,
        assistantMessage,
        assistantPersisted,
        conversationId,
        createdConversationId,
        navigateHome,
        setConversationId,
        setConversations,
        setMessages,
        userMessage,
        userPersisted,
        vault,
      });
    } finally {
      if (statsTimer !== undefined) window.clearInterval(statsTimer);
      if (statsTimerRef.current === statsTimer) {
        statsTimerRef.current = undefined;
      }
      abortControllerRef.current = null;
      releaseHeldBusyLock();
    }
    return true;
  }

  return {
    sendUserTurn,
    stopResponse,
  };
}
