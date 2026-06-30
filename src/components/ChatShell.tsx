import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "react-router";
import {
  Info,
  PenLine,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import type { ReasoningEffort } from "@/types/domain";
import type { ChatContextSnapshot } from "@/lib/chatApi";
import type { ConversationListItem } from "@/lib/conversations";
import type { PendingAttachment } from "@/lib/messages";
import { routeConversationIdFromPath } from "@/lib/chatRoutes";
import { env } from "@/lib/env";
import type { UnlockedVault } from "@/lib/vault";
import { useActiveConversation } from "@/hooks/useActiveConversation";
import { useBusyLock } from "@/hooks/useBusyLock";
import { useComposerControls } from "@/hooks/useComposerControls";
import { useConversationCatalog } from "@/hooks/useConversationCatalog";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useMessageDeletion } from "@/hooks/useMessageDeletion";
import { useMessageViewport } from "@/hooks/useMessageViewport";
import { useMessageSharing } from "@/hooks/useMessageSharing";
import { useProviderModels } from "@/hooks/useProviderModels";
import { useRetryUserTurn } from "@/hooks/useRetryUserTurn";
import { useSendUserTurn } from "@/hooks/useSendUserTurn";
import { ChatSidebar } from "./chat/ChatSidebar";
import { Composer } from "./chat/Composer";
import { DeleteConversationDialog } from "./chat/DeleteConversationDialog";
import { MessageTimeline } from "./chat/MessageTimeline";
import { ContextMenu } from "./ContextMenu";

const reasoningEffortOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "default", label: "Default" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/** Props for the main authenticated chat application shell. */
type ChatShellProps = {
  /** Authenticated Supabase user shown in account/settings UI. */
  user: User;
  /** Unlocked encryption vault used by chat, settings, and share operations. */
  vault: UnlockedVault;
  /** Signs the user out of the application. */
  onLogout: () => void;
};

/** Coordinates chat layout, sidebar, timeline, composer, and conversation actions. */
export function ChatShell({ user, vault, onLogout }: ChatShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeConversationId = routeConversationIdFromPath(location.pathname);
  const isSettingsRoute = /^\/settings(?:\/|$)/.test(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queuedDraft, setQueuedDraft] = useState<string | null>(null);
  const [contextInspectorOpen, setContextInspectorOpen] = useState(false);
  const [lastContextSnapshot, setLastContextSnapshot] =
    useState<ChatContextSnapshot | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileConversationsRef = useRef<HTMLDivElement | null>(null);
  const {
    closeModelMenu,
    fileInputRef,
    handleDraftKeyDown,
    handleReasoningEffortChange,
    modelMenuOpen,
    modelMenuRef,
    reasoningEffort,
    reasoningMenuOpen,
    reasoningMenuRef,
    thinkingMode,
    toggleModelMenu,
    toggleReasoningMenu,
    toggleThinkingMode,
  } = useComposerControls();
  const {
    acquireBusyLock,
    busy,
    busyRef,
    releaseBusyLock,
  } = useBusyLock();
  const {
    conversationId,
    loadingMessages,
    messages,
    openConversation,
    setConversationId,
    setMessages,
    startNewConversation: resetActiveConversation,
  } = useActiveConversation({
    busyRef,
    isSettingsRoute,
    onError: setError,
    routeConversationId: routeConversationId ?? null,
    vault,
  });

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
    onActiveConversationDeleted: resetActiveConversation,
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
  const {
    autoScrollRef,
    handleMessagesScroll,
    loadAttachmentPreview,
    messagesRef,
    resetAutoScroll,
  } = useMessageViewport({
    busy,
    conversationId,
    loadingConversations,
    loadingMessages,
    messages,
    vault,
  });
  const chatReturnPath = conversationId
    ? `/chat/${encodeURIComponent(conversationId)}`
    : "/";
  const openProviderSettings = useCallback(() => {
    navigate("/settings/provider", {
      state: {
        returnTo: chatReturnPath,
      },
    });
  }, [chatReturnPath, navigate]);
  const { sendUserTurn, stopResponse } = useSendUserTurn({
    acquireBusyLock,
    autoScrollRef,
    conversationId,
    defaultHistoryMessages: messages,
    defaultModel: model,
    defaultProvider: provider,
    navigateHome: () => navigate("/"),
    navigateToConversation: (nextConversationId) =>
      navigate(`/chat/${encodeURIComponent(nextConversationId)}`),
    onContextSnapshot: setLastContextSnapshot,
    onError: setError,
    onOpenProviderSettings: openProviderSettings,
    providerKeys,
    reasoningEffort,
    releaseBusyLock,
    setConversationId,
    setConversations,
    setMessages,
    thinkingMode,
    vault,
  });
  const { retryUserTurn } = useRetryUserTurn({
    acquireBusyLock,
    busyRef,
    conversationId,
    defaultModel: model,
    defaultProvider: provider,
    messages,
    onError: setError,
    onOpenProviderSettings: openProviderSettings,
    providerKeys,
    releaseBusyLock,
    sendUserTurn,
    vault,
  });
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

  const startNewChat = useCallback(() => {
    resetActiveConversation();
    resetAutoScroll();
    clearEditingConversation();
    setContextInspectorOpen(false);
    setLastContextSnapshot(null);
  }, [clearEditingConversation, resetActiveConversation, resetAutoScroll]);

  useEffect(() => {
    window.addEventListener("salty:new-chat", startNewChat);
    return () => window.removeEventListener("salty:new-chat", startNewChat);
  }, [startNewChat]);

  const handleOpenConversation = useCallback((nextConversationId: string) => {
    setMobileConversationsOpen(false);
    setContextInspectorOpen(false);
    setLastContextSnapshot(null);
    resetAutoScroll();
    clearEditingConversation();
    void openConversation(nextConversationId);
  }, [clearEditingConversation, openConversation, resetAutoScroll]);

  const handleComposerModelChange = useCallback((value: string) => {
    handleModelChange(value);
    closeModelMenu();
  }, [closeModelMenu, handleModelChange]);

  const handleSettingsPopoverOpenChange = useCallback((open: boolean) => {
    setMobileConversationsOpen(false);
    setSettingsPopoverOpen(open);
  }, []);

  const handleToggleMobileConversations = useCallback(() => {
    setSettingsPopoverOpen(false);
    setMobileConversationsOpen((value) => !value);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((value) => !value);
  }, []);

  const handleShareConversationSnapshot = useCallback(() => {
    void shareConversationSnapshot();
  }, [shareConversationSnapshot]);

  const handleToggleContextInspector = useCallback(() => {
    setContextInspectorOpen((value) => !value);
  }, []);

  const handleQueueDraft = useCallback((draft: string) => {
    const nextDraft = draft.trim();
    if (!nextDraft) return false;
    setQueuedDraft(nextDraft);
    return true;
  }, []);

  const handleDeleteQueuedDraft = useCallback(() => {
    setQueuedDraft(null);
  }, []);

  const handleSteerQueuedDraft = useCallback(() => {
    if (!queuedDraft || !busyRef.current) return;
    stopResponse();
  }, [busyRef, queuedDraft, stopResponse]);

  const handleSubmit = useCallback(async ({
    draft,
    files,
  }: {
    draft: string;
    files: File[];
  }) => {
    if ((!draft.trim() && files.length === 0) || busyRef.current) return false;

    const submittedDraft = draft.trim();
    const submittedFiles = files;
    const pendingAttachments: PendingAttachment[] = submittedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      type: file.type.startsWith("image/") ? "image" : "file",
    }));

    return sendUserTurn({
      parts: [
        ...(submittedDraft ? [{ type: "text" as const, text: submittedDraft }] : []),
        ...pendingAttachments.map((attachment) => ({
          type: attachment.type,
          attachmentId: attachment.id,
        })),
      ],
      pendingAttachments,
      title: submittedDraft || submittedFiles[0]?.name || "New conversation",
    });
  }, [busyRef, sendUserTurn]);

  useEffect(() => {
    if (busy || !queuedDraft) return;

    const draftToSend = queuedDraft;
    setQueuedDraft(null);
    void handleSubmit({ draft: draftToSend, files: [] }).then((sent) => {
      if (sent) return;
      setQueuedDraft((current) => current ?? draftToSend);
    });
  }, [busy, handleSubmit, queuedDraft]);

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
        onOpenConversation={handleOpenConversation}
        onRenameSubmit={handleRenameSubmit}
        onSettingsPopoverOpenChange={handleSettingsPopoverOpenChange}
        onStartNewConversation={startNewChat}
        onToggleMobileConversations={handleToggleMobileConversations}
        onToggleSidebar={handleToggleSidebar}
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
              aria-label="Inspect context"
              className="conversation-share-button"
              disabled={!lastContextSnapshot}
              onClick={handleToggleContextInspector}
              title="Inspect context"
              type="button"
            >
              <Info size={14} />
            </button>
            <button
              aria-label="Share conversation"
              className="conversation-share-button"
              disabled={busy || !conversationId || messages.length === 0}
              onClick={handleShareConversationSnapshot}
              title="Share conversation"
              type="button"
            >
              <Share2 size={14} />
            </button>
          </div>
        </header>

        {contextInspectorOpen ? (
          <aside className="context-inspector" aria-label="Context inspector">
            <header>
              <div>
                <strong>Context inspector</strong>
                <span>
                  {lastContextSnapshot
                    ? `${lastContextSnapshot.provider}:${lastContextSnapshot.model}`
                    : "No context captured"}
                </span>
              </div>
              <button
                aria-label="Close context inspector"
                className="icon-button"
                onClick={() => setContextInspectorOpen(false)}
                type="button"
              >
                <X size={15} />
              </button>
            </header>
            {lastContextSnapshot ? (
              <div className="context-inspector-list">
                {lastContextSnapshot.blocks.map((block, index) => (
                  <details
                    className="context-inspector-block"
                    key={`${block.kind}-${index}`}
                    open={index < 3}
                  >
                    <summary>
                      <span>{block.title}</span>
                      <code>{block.kind}</code>
                    </summary>
                    <pre>{block.content}</pre>
                  </details>
                ))}
              </div>
            ) : (
              <p>No context has been captured for this conversation yet.</p>
            )}
          </aside>
        ) : null}

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
          fileInputRef={fileInputRef}
          modelMenuOpen={modelMenuOpen}
          modelMenuRef={modelMenuRef}
          onDraftKeyDown={handleDraftKeyDown}
          onModelChange={handleComposerModelChange}
          onDeleteQueuedDraft={handleDeleteQueuedDraft}
          onReasoningEffortChange={handleReasoningEffortChange}
          onQueueDraft={handleQueueDraft}
          onSteerQueuedDraft={handleSteerQueuedDraft}
          onSubmit={handleSubmit}
          onStopResponse={stopResponse}
          onToggleModelMenu={toggleModelMenu}
          onToggleReasoningMenu={toggleReasoningMenu}
          onToggleThinkingMode={toggleThinkingMode}
          reasoningEffort={reasoningEffort}
          reasoningEffortOptions={reasoningEffortOptions}
          reasoningMenuOpen={reasoningMenuOpen}
          reasoningMenuRef={reasoningMenuRef}
          selectedModelLabel={selectedModelLabel}
          selectedModelValue={selectedModelValue}
          selectedSupportsAttachments={selectedSupportsAttachments}
          thinkingMode={thinkingMode}
          queuedDraft={queuedDraft}
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

      <DeleteConversationDialog
        conversation={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDeleteConversation}
      />
    </section>
  );
}
