import {
  FormEvent,
  UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "react-router";
import {
  PenLine,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import type {
  ChatAttachment,
  ChatMessage,
  ChatResponseStats,
  MessagePart,
  ProviderId,
  ReasoningEffort,
} from "@/types/domain";
import {
  createConversation,
  refreshConversationLastMessageAt,
  type ConversationListItem,
} from "@/lib/conversations";
import {
  deleteMessages,
  encryptedAttachmentToDataUrl,
  loadMessages,
  reassignAttachmentsToMessage,
  saveMessage,
  updateMessageContent,
  updateMessageStatus,
} from "@/lib/messages";
import type { PendingAttachment } from "@/lib/messages";
import { streamChat, textFromParts } from "@/lib/chatApi";
import {
  cloneMessageParts,
  userTurnMessageIds,
} from "@/lib/chatMessageUtils";
import { routeConversationIdFromPath } from "@/lib/chatRoutes";
import { createAssistantStreamState } from "@/lib/assistantStreamState";
import { createChatTurnDraft } from "@/lib/chatTurnDraft";
import {
  bumpConversation,
  upsertConversation,
} from "@/lib/conversationListUtils";
import { createUsageEventRecorder } from "@/lib/chatUsageRecorder";
import { env } from "@/lib/env";
import { handleEmptyAssistantResponse } from "@/lib/emptyAssistantResponse";
import {
  retryAttachmentsFromMessage,
} from "@/lib/messageAttachmentMaterialization";
import {
  safeTouchConversation,
  settleInterruptedAssistantMessages,
} from "@/lib/messageSettlement";
import {
  resolveProviderApiKey,
  validateTurnAttachments,
} from "@/lib/providerValidation";
import { rollbackFailedTurn } from "@/lib/turnRollback";
import type { UnlockedVault } from "@/lib/vault";
import { useBusyLock } from "@/hooks/useBusyLock";
import { useComposerControls } from "@/hooks/useComposerControls";
import { useConversationCatalog } from "@/hooks/useConversationCatalog";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useMessageDeletion } from "@/hooks/useMessageDeletion";
import { useMessageSharing } from "@/hooks/useMessageSharing";
import { useProviderModels } from "@/hooks/useProviderModels";
import { ChatSidebar } from "./chat/ChatSidebar";
import { Composer } from "./chat/Composer";
import { MessageTimeline } from "./chat/MessageTimeline";
import { ContextMenu } from "./ContextMenu";

const reasoningEffortOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "default", label: "Default" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

type ChatShellProps = {
  user: User;
  vault: UnlockedVault;
  onLogout: () => void;
};

export function ChatShell({ user, vault, onLogout }: ChatShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeConversationId = routeConversationIdFromPath(location.pathname);
  const isSettingsRoute = /^\/settings(?:\/|$)/.test(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileConversationsRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const openingConversationRef = useRef<string | null>(null);
  const statsTimerRef = useRef<number | undefined>(undefined);
  const {
    closeModelMenu,
    draft,
    fileInputRef,
    handleAddPendingFiles,
    handleDraftKeyDown,
    handleReasoningEffortChange,
    handleRemovePendingFile,
    modelMenuOpen,
    modelMenuRef,
    pendingFiles,
    reasoningEffort,
    reasoningMenuOpen,
    reasoningMenuRef,
    setDraft,
    setPendingFiles,
    thinkingMode,
    toggleModelMenu,
    toggleReasoningMenu,
    toggleThinkingMode,
  } = useComposerControls();
  const {
    acquireBusyLock,
    busy,
    busyRef,
    clearBusyLock,
    releaseBusyLock,
  } = useBusyLock();

  const handleProviderError = useCallback((message: string) => {
    setError(message);
  }, []);
  const {
    availableModels,
    handleModelChange,
    model,
    provider,
    providerKeys,
    selectedModelLabel,
    selectedModelValue,
    selectedSupportsAttachments,
    updateProviderKey,
  } = useProviderModels({
    onError: handleProviderError,
    vault,
  });
  const {
    clearEditingConversation,
    confirmDeleteConversation,
    contextMenu,
    conversations,
    editingConversationId,
    handleContextMenuDelete,
    handleContextMenuEdit,
    handleConversationContextMenu,
    handleRenameSubmit,
    loadingConversations,
    pendingDelete,
    setContextMenu,
    setConversations,
    setPendingDelete,
  } = useConversationCatalog({
    activeConversationId: conversationId,
    onActiveConversationDeleted: () => {
      navigate("/");
      setConversationId(null);
      setMessages([]);
      setError(null);
    },
    onError: setError,
    vault,
  });
  const activeConversationTitle =
    conversations.find((conversation) => conversation.id === conversationId)?.title ??
    "New chat";
  const { shareConversationSnapshot, shareMessageTurn } = useMessageSharing({
    activeConversationTitle,
    busy,
    conversationId,
    messages,
    onError: setError,
    onNotice: setNotice,
    vault,
  });
  const { deleteUserTurn } = useMessageDeletion({
    busy,
    conversationId,
    messages,
    onError: setError,
    setConversations,
    setMessages,
    vault,
  });
  const chatReturnPath = conversationId
    ? `/chat/${encodeURIComponent(conversationId)}`
    : "/";
  const messageActionContext = useMemo(
    () => ({
      conversationId,
      model,
      provider,
      providerKeys,
      reasoningEffort,
      thinkingMode,
      vault,
    }),
    [
      conversationId,
      model,
      provider,
      providerKeys,
      reasoningEffort,
      thinkingMode,
      vault,
    ],
  );
  useEffect(() => {
    document.title = conversationId
      ? `${activeConversationTitle} — ${env.appName}`
      : env.appName;
  }, [conversationId, activeConversationTitle]);

  useEffect(() => {
    if (isSettingsRoute) return;
    if (busyRef.current) return;

    if (routeConversationId) {
      void openConversation(routeConversationId, false);
      return;
    }

    startNewConversation(false);
  }, [isSettingsRoute, routeConversationId, vault]);

  useClickOutside({
    open: settingsPopoverOpen,
    ref: settingsMenuRef,
    onClose: () => setSettingsPopoverOpen(false),
  });

  useClickOutside({
    open: mobileConversationsOpen,
    ref: mobileConversationsRef,
    onClose: () => setMobileConversationsOpen(false),
  });

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (statsTimerRef.current !== undefined) {
        window.clearInterval(statsTimerRef.current);
        statsTimerRef.current = undefined;
      }
      clearBusyLock();
    };
  }, [clearBusyLock]);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;

    const scrollToEnd = (behavior: ScrollBehavior = "instant") => {
      if (!autoScrollRef.current) return;
      node.scrollTo({ top: node.scrollHeight, behavior });
    };

    // Instant scroll on content changes — avoids racing with handleMessagesScroll
    // during smooth scroll animations while images are still loading.
    scrollToEnd("instant");

    // Instant scroll as layout settles (streaming tokens, images loading).
    const observer = new ResizeObserver(() => scrollToEnd("instant"));
    observer.observe(node);

    return () => observer.disconnect();
  }, [messages, busy, loadingMessages]);

  function startNewConversation(updateRoute = true) {
    if (updateRoute) navigate("/");
    setConversationId(null);
    setMessages([]);
    setError(null);
    clearEditingConversation();
  }

  function openProviderSettings() {
    navigate("/settings/provider", {
      state: {
        returnTo: chatReturnPath,
      },
    });
  }

  async function openConversation(nextConversationId: string, updateRoute = true) {
    if (conversationId === nextConversationId) {
      if (updateRoute) navigate(`/chat/${encodeURIComponent(nextConversationId)}`);
      return;
    }
    if (openingConversationRef.current === nextConversationId) return;

    openingConversationRef.current = nextConversationId;
    if (updateRoute) navigate(`/chat/${encodeURIComponent(nextConversationId)}`);
    setConversationId(nextConversationId);
    setLoadingMessages(true);
    setError(null);
    clearEditingConversation();
    autoScrollRef.current = true;

    try {
      const loadedMessages = await loadMessages(vault, nextConversationId);
      setMessages(
        busyRef.current
          ? loadedMessages
          : await settleInterruptedAssistantMessages(
              vault,
              loadedMessages,
              nextConversationId,
            ),
      );
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to load messages.",
      );
    } finally {
      if (openingConversationRef.current === nextConversationId) {
        openingConversationRef.current = null;
      }
      setLoadingMessages(false);
    }
  }

  function handleComposerModelChange(value: string) {
    handleModelChange(value);
    closeModelMenu();
  }

  const handleMessagesScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    autoScrollRef.current = distanceFromBottom < 96;
  }, []);

  function stopResponse() {
    abortControllerRef.current?.abort();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if ((!draft.trim() && pendingFiles.length === 0) || busyRef.current) return;

    const submittedDraft = draft.trim();
    const submittedFiles = pendingFiles;
    const pendingAttachments: PendingAttachment[] = submittedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      type: file.type.startsWith("image/") ? "image" : "file",
    }));

    await sendUserTurn({
      parts: [
        ...(submittedDraft ? [{ type: "text" as const, text: submittedDraft }] : []),
        ...pendingAttachments.map((attachment) => ({
          type: attachment.type,
          attachmentId: attachment.id,
        })),
      ],
      pendingAttachments,
      title: submittedDraft || submittedFiles[0]?.name || "New conversation",
      clearComposer: true,
    });
  }

  async function sendUserTurn({
    parts,
    pendingAttachments = [],
    reusedAttachments = [],
    title,
    historyMessages = messages,
    turnProvider = provider,
    turnModel = model,
    clearComposer = false,
    afterTurnSaved,
    busyLockAcquired = false,
  }: {
    parts: MessagePart[];
    pendingAttachments?: PendingAttachment[];
    reusedAttachments?: ChatAttachment[];
    title: string;
    historyMessages?: ChatMessage[];
    turnProvider?: ProviderId;
    turnModel?: string;
    clearComposer?: boolean;
    afterTurnSaved?: (userMessage: ChatMessage, assistantMessage: ChatMessage) => Promise<void>;
    busyLockAcquired?: boolean;
  }) {
    let lockHeld = busyLockAcquired;
    const releaseHeldBusyLock = () => {
      if (!lockHeld) return;
      releaseBusyLock();
      lockHeld = false;
    };

    const providerKey = resolveProviderApiKey({
      model: turnModel,
      provider: turnProvider,
      providerKeys,
    });
    if (!providerKey.ok) {
      releaseHeldBusyLock();
      setError(providerKey.error);
      openProviderSettings();
      return;
    }
    const apiKey = providerKey.apiKey;

    const attachmentError = validateTurnAttachments({
      model: turnModel,
      pendingAttachments,
      provider: turnProvider,
      reusedAttachments,
    });
    if (attachmentError) {
      releaseHeldBusyLock();
      setError(attachmentError);
      return;
    }

    if (!lockHeld) {
      if (!acquireBusyLock()) return;
      lockHeld = true;
    }
    setError(null);
    autoScrollRef.current = true;

    let turnDraft: Awaited<ReturnType<typeof createChatTurnDraft>>;
    try {
      turnDraft = await createChatTurnDraft({
        parts,
        pendingAttachments,
        provider: turnProvider,
        reusedAttachments,
        model: turnModel,
      });
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to read attachments.",
      );
      releaseHeldBusyLock();
      return;
    }
    const {
      assistantMessage,
      completedUserMessage,
      requestAttachmentMap,
      userMessage,
    } = turnDraft;

    if (clearComposer) {
      setDraft("");
      setPendingFiles([]);
    }
    setMessages([...historyMessages, userMessage]);

    let statsTimer: number | undefined;
    let assistantPersisted = false;
    let userPersisted = false;
    let createdConversationId: string | null = null;
    let assistantContentPersisted = false;
    let latestResponseStats: ChatResponseStats | undefined;
    const usageRecorder = createUsageEventRecorder({
      model: turnModel,
      provider: turnProvider,
      vault,
    });

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const isNewConversation = !conversationId;
      const nextConversationId =
        conversationId ??
        (await createConversation(vault, title.slice(0, 80), turnProvider, turnModel));
      usageRecorder.setConversationId(nextConversationId);
      if (isNewConversation) createdConversationId = nextConversationId;
      setConversationId(nextConversationId);
      navigate(`/chat/${encodeURIComponent(nextConversationId)}`);
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
        model: turnModel,
        pendingAttachments,
      });
      userPersisted = true;
      await saveMessage(vault, assistantMessage, nextConversationId, turnProvider, {
        model: turnModel,
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
        model: turnModel,
        apiKey,
        thinkingMode,
        reasoningEffort,
        messages: [
          ...historyMessages,
          {
            ...completedUserMessage,
            attachments: {
              ...completedUserMessage.attachments,
              ...requestAttachmentMap,
            },
          },
        ],
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
        const completedAssistantMessage: ChatMessage = {
          ...assistantMessage,
          status: abortController.signal.aborted ? "cancelled" : "completed",
          parts: [{ type: "markdown", text: assistantText }],
          responseStats: stats,
        };
        const { cleanupFailed } = await updateMessageContent(
          vault,
          completedAssistantMessage,
          nextConversationId,
          turnProvider,
          { model: turnModel },
        );
        assistantContentPersisted = true;
        if (cleanupFailed) {
          setError("Response saved, but old message parts could not be cleaned up.");
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
          setError("Response saved, but the previous retry turn could not be deleted.");
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
        return;
      }
      // Skip touchConversation when afterTurnSaved handles the timestamp refresh.
      if (!afterTurnSaved) await safeTouchConversation(nextConversationId);
    } catch (unknownError) {
      setError(
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
        navigateHome: () => navigate("/"),
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
  }

  async function retryUserTurn(userMessage: ChatMessage) {
    if (busyRef.current) return;

    const turnMessageIds = userTurnMessageIds(messages, userMessage.id);
    if (turnMessageIds.length === 0) return;
    const retryConversationId = conversationId;

    try {
      setError(null);
      const turnProvider = userMessage.provider ?? provider;
      const turnModel = userMessage.model ?? model;
      const providerKey = resolveProviderApiKey({
        model: turnModel,
        provider: turnProvider,
        providerKeys,
      });
      if (!providerKey.ok) {
        setError(providerKey.error);
        openProviderSettings();
        return;
      }
      const resolvedTurnModel = providerKey.model;

      if (!acquireBusyLock()) return;
      const retryAttachments = await retryAttachmentsFromMessage({
        conversationId: retryConversationId,
        userMessage,
        vault,
      });
      const attachmentError = validateTurnAttachments({
        model: resolvedTurnModel,
        pendingAttachments: retryAttachments.pendingAttachments,
        provider: turnProvider,
        reusedAttachments: retryAttachments.reusedAttachments,
      });
      if (attachmentError) {
        releaseBusyLock();
        setError(attachmentError);
        return;
      }

      const retryHistory = messages.filter(
        (message) => !turnMessageIds.includes(message.id),
      );
      const reusedAttachmentIds = retryAttachments.reusedAttachments.map(
        (attachment) => attachment.id,
      );
      await sendUserTurn({
        parts: cloneMessageParts(userMessage.parts),
        pendingAttachments: retryAttachments.pendingAttachments,
        reusedAttachments: retryAttachments.reusedAttachments,
        title: textFromParts(userMessage.parts).trim() || "Retried message",
        historyMessages: retryHistory,
        turnProvider,
        turnModel: resolvedTurnModel,
        afterTurnSaved: retryConversationId
          ? async (newUserMessage) => {
              await reassignAttachmentsToMessage(
                vault,
                retryConversationId,
                newUserMessage.id,
                reusedAttachmentIds,
              );
              await deleteMessages(vault, turnMessageIds);
              await refreshConversationLastMessageAt(retryConversationId);
            }
          : undefined,
        busyLockAcquired: true,
      });
    } catch (unknownError) {
      if (busyRef.current) releaseBusyLock();
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to retry message.",
      );
    }
  }

  const scrollMessagesToEnd = useCallback(() => {
    const node = messagesRef.current;
    if (!node || !autoScrollRef.current) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "instant" });
  }, []);

  const loadAttachmentPreview = useCallback(
    (attachment: ChatAttachment) => {
      if (!conversationId) return Promise.reject(new Error("Conversation is not ready."));
      return encryptedAttachmentToDataUrl(vault, conversationId, attachment).then(
        (url) => {
          // Scroll again once the image data URL resolves and the DOM settles.
          requestAnimationFrame(() => scrollMessagesToEnd());
          return url;
        },
      );
    },
    [conversationId, vault, scrollMessagesToEnd],
  );

  return (
    <section className={sidebarCollapsed ? "chat-layout collapsed" : "chat-layout"}>
      <ChatSidebar
        activeConversationId={conversationId}
        appName={env.appName}
        conversations={conversations}
        editingConversationId={editingConversationId}
        mobileConversationsOpen={mobileConversationsOpen}
        mobileConversationsRef={mobileConversationsRef}
        onContextMenu={handleConversationContextMenu}
        onLogout={onLogout}
        onOpenConversation={(nextConversationId) => {
          setMobileConversationsOpen(false);
          void openConversation(nextConversationId);
        }}
        onRenameSubmit={handleRenameSubmit}
        onSettingsPopoverOpenChange={(open) => {
          setMobileConversationsOpen(false);
          setSettingsPopoverOpen(open);
        }}
        onStartNewConversation={() => startNewConversation()}
        onToggleMobileConversations={() => {
          setSettingsPopoverOpen(false);
          setMobileConversationsOpen((value) => !value);
        }}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
        returnTo={chatReturnPath}
        settingsMenuRef={settingsMenuRef}
        settingsPopoverOpen={settingsPopoverOpen}
        sidebarCollapsed={sidebarCollapsed}
        user={user}
      />

      <div className="conversation">
        <header className="conversation-header">
          <strong>{activeConversationTitle}</strong>
          <div className="conversation-meta">
            <button
              aria-label="Share conversation"
              className="conversation-share-button"
              disabled={busy || !conversationId || messages.length === 0}
              onClick={() => {
                void shareConversationSnapshot();
              }}
              title="Share conversation"
              type="button"
            >
              <Share2 size={14} />
            </button>
          </div>
        </header>

        <MessageTimeline
          actionContext={messageActionContext}
          busy={busy}
          loadAttachmentPreview={loadAttachmentPreview}
          loadingConversations={loadingConversations}
          loadingMessages={loadingMessages}
          messages={messages}
          messagesRef={messagesRef}
          onDeleteUserTurn={deleteUserTurn}
          onMessagesScroll={handleMessagesScroll}
          onRetryUserTurn={retryUserTurn}
          onShareMessageTurn={shareMessageTurn}
        />

        {error ? <div className="notice danger">{error}</div> : null}
        {notice ? <div className="notice success">{notice}</div> : null}

        <Composer
          availableModels={availableModels}
          busy={busy}
          draft={draft}
          fileInputRef={fileInputRef}
          modelMenuOpen={modelMenuOpen}
          modelMenuRef={modelMenuRef}
          onAddPendingFiles={handleAddPendingFiles}
          onDraftChange={setDraft}
          onDraftKeyDown={handleDraftKeyDown}
          onModelChange={handleComposerModelChange}
          onReasoningEffortChange={handleReasoningEffortChange}
          onRemovePendingFile={handleRemovePendingFile}
          onSubmit={handleSubmit}
          onStopResponse={stopResponse}
          onToggleModelMenu={toggleModelMenu}
          onToggleReasoningMenu={toggleReasoningMenu}
          onToggleThinkingMode={toggleThinkingMode}
          pendingFiles={pendingFiles}
          reasoningEffort={reasoningEffort}
          reasoningEffortOptions={reasoningEffortOptions}
          reasoningMenuOpen={reasoningMenuOpen}
          reasoningMenuRef={reasoningMenuRef}
          selectedModelLabel={selectedModelLabel}
          selectedModelValue={selectedModelValue}
          selectedSupportsAttachments={selectedSupportsAttachments}
          thinkingMode={thinkingMode}
        />
      </div>

      <ContextMenu
        open={contextMenu !== null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
      >
        <button
          className="context-menu-item"
          onClick={handleContextMenuEdit}
          role="menuitem"
          type="button"
        >
          <PenLine size={14} />
          <span>Rename</span>
        </button>
        <button
          className="context-menu-item danger"
          onClick={handleContextMenuDelete}
          role="menuitem"
          type="button"
        >
          <Trash2 size={14} />
          <span>Delete</span>
        </button>
      </ContextMenu>

      {pendingDelete ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true">
            <h2>Delete conversation?</h2>
            <p>
              This permanently deletes "{pendingDelete.title}", its messages, and
              uploaded files. This action cannot be undone.
            </p>
            <div className="confirm-actions">
              <button
                className="ghost-button"
                onClick={() => setPendingDelete(null)}
                type="button"
                aria-label="Cancel delete"
              >
                <X size={16} />
                Cancel
              </button>
              <button
                className="danger-button"
                onClick={confirmDeleteConversation}
                type="button"
                aria-label="Confirm delete"
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
