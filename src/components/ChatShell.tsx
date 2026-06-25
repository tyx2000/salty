import {
  FormEvent,
  KeyboardEvent,
  UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import {
  CircleAlert,
  Brain,
  Check,
  ChevronDown,
  Gauge,
  Paperclip,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Share2,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type {
  ChatAttachment,
  ChatMessage,
  ChatResponseStats,
  MessagePart,
  ProviderId,
  ProviderKeyState,
  ProviderModel,
  ReasoningEffort,
  ThinkingMode,
} from "@/types/domain";
import {
  createConversation,
  deleteConversation,
  loadConversations,
  refreshConversationLastMessageAt,
  touchConversation,
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
import { flushPendingAttachmentStorageRemovals } from "@/lib/attachmentStorage";
import { streamChat, testProviderKey, textFromParts } from "@/lib/chatApi";
import { env } from "@/lib/env";
import { enrichProviderModel, supportsAttachments } from "@/lib/modelCapabilities";
import {
  emptyProviderKeyState,
  loadEncryptedProviderKeys,
} from "@/lib/providerKeys";
import {
  createConversationShare,
  createMessageTurnShare,
} from "@/lib/shares";
import type { UnlockedVault } from "@/lib/vault";
import { ConversationList } from "./ConversationList";
import { MessagePartRenderer } from "./MessagePartRenderer";
import { SettingsModal } from "./SettingsModal";
import { SettingsPopover } from "./SettingsPopover";

const providerLabels: Record<ProviderId, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

function formatProviderLabel(providerId: ProviderId) {
  return providerLabels[providerId] ?? providerId;
}

const reasoningEffortOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "default", label: "Default" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

type AvailableModel = {
  provider: ProviderId;
  model: ProviderModel;
};

type ChatShellProps = {
  user: User;
  vault: UnlockedVault;
  onLogout: () => void;
};

const chatRoutePrefix = "/chat/";

function getRouteConversationId() {
  if (typeof window === "undefined") return null;

  const path = window.location.pathname;
  if (!path.startsWith(chatRoutePrefix)) return null;

  const routeValue = path.slice(chatRoutePrefix.length).split("/")[0];
  return routeValue ? decodeURIComponent(routeValue) : null;
}

function pushConversationRoute(conversationId: string) {
  if (typeof window === "undefined") return;

  const nextPath = `${chatRoutePrefix}${encodeURIComponent(conversationId)}`;
  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, "", nextPath);
  }
}

function pushNewConversationRoute() {
  if (typeof window === "undefined") return;

  if (window.location.pathname !== "/") {
    window.history.pushState({}, "", "/");
  }
}

export function ChatShell({ user, vault, onLogout }: ChatShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [model, setModel] = useState("");
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("disabled");
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("default");
  const [providerKeys, setProviderKeys] =
    useState<Record<ProviderId, ProviderKeyState>>(emptyProviderKeyState);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [pendingDelete, setPendingDelete] =
    useState<ConversationListItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileConversationsRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoScrollRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const statsTimerRef = useRef<number | undefined>(undefined);

  const availableModels = useMemo<AvailableModel[]>(() => {
    return (["openai", "deepseek"] as ProviderId[]).flatMap((providerId) =>
      providerKeys[providerId].models
        .filter(
          (availableModel) =>
            !providerKeys[providerId].hiddenModelIds.includes(availableModel.id),
        )
        .map((availableModel) => ({
          provider: providerId,
          model: availableModel,
        })),
    );
  }, [providerKeys]);

  const selectedModelValue = model ? `${provider}:${model}` : "";
  const selectedModelLabel = model || "Test an API key first";
  const selectedSupportsAttachments = model
    ? supportsAttachments(provider, model)
    : false;
  const activeConversationTitle =
    conversations.find((conversation) => conversation.id === conversationId)?.title ??
    "New chat";
  const contextTokenEstimate = useMemo(
    () => estimateContextTokens(messages, draft, pendingFiles),
    [messages, draft, pendingFiles],
  );

  useEffect(() => {
    document.title = conversationId
      ? `${activeConversationTitle} — ${env.appName}`
      : env.appName;
  }, [conversationId, activeConversationTitle]);

  useEffect(() => {
    let cancelled = false;

    async function loadExistingConversations() {
      setLoadingConversations(true);
      setError(null);

      try {
        await flushPendingAttachmentStorageRemovals(vault.userId);
        const rows = await loadConversations(vault);
        if (!cancelled) {
          setConversations(rows);

          const routedConversationId = getRouteConversationId();
          if (routedConversationId) {
            void openConversation(routedConversationId, false);
          }
        }
      } catch (unknownError) {
        if (!cancelled) {
          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "Unable to load conversations.",
          );
        }
      } finally {
        if (!cancelled) setLoadingConversations(false);
      }
    }

    loadExistingConversations();

    return () => {
      cancelled = true;
    };
  }, [vault]);

  useEffect(() => {
    function handlePopState() {
      const routedConversationId = getRouteConversationId();
      if (routedConversationId) {
        void openConversation(routedConversationId, false);
        return;
      }

      startNewConversation(false);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [vault]);

  useEffect(() => {
    if (!settingsPopoverOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (settingsMenuRef.current?.contains(target)) return;
      setSettingsPopoverOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsPopoverOpen]);

  useEffect(() => {
    if (!mobileConversationsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mobileConversationsRef.current?.contains(target)) return;
      setMobileConversationsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [mobileConversationsOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (modelMenuRef.current?.contains(target)) return;
      setModelMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!reasoningMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (reasoningMenuRef.current?.contains(target)) return;
      setReasoningMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [reasoningMenuOpen]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (statsTimerRef.current !== undefined) {
        window.clearInterval(statsTimerRef.current);
        statsTimerRef.current = undefined;
      }
      busyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!busy) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [busy]);

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

  useEffect(() => {
    let cancelled = false;

    async function loadSavedProviderKeys() {
      try {
        const savedKeys = await loadEncryptedProviderKeys(vault);

        for (const providerId of ["openai", "deepseek"] as ProviderId[]) {
          const apiKey = savedKeys[providerId];
          if (!apiKey) continue;

          setProviderKeys((current) => ({
            ...current,
            [providerId]: {
              ...current[providerId],
              apiKey,
              hiddenModelIds: loadHiddenModelIds(vault.userId, providerId),
            },
          }));

          const result = await testProviderKey(providerId, apiKey);
          if (cancelled) return;
          const hiddenModelIds = loadHiddenModelIds(vault.userId, providerId);
          const models = result.models.map((availableModel) =>
            enrichProviderModel(providerId, availableModel),
          );
          const firstVisibleModel = models.find(
            (availableModel) => !hiddenModelIds.includes(availableModel.id),
          );

          setProviderKeys((current) => ({
            ...current,
            [providerId]: {
              apiKey,
              hiddenModelIds,
              models,
              tested: true,
            },
          }));

          if (!model && firstVisibleModel) {
            setProvider(providerId);
            setModel(firstVisibleModel.id);
          }
        }
      } catch (unknownError) {
        if (!cancelled) {
          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "Unable to load saved provider keys.",
          );
        }
      }
    }

    loadSavedProviderKeys();

    return () => {
      cancelled = true;
    };
  }, [vault]);

  function updateProviderKey(providerId: ProviderId, state: ProviderKeyState) {
    saveHiddenModelIds(vault.userId, providerId, state.hiddenModelIds);
    const models = state.models.map((availableModel) =>
      enrichProviderModel(providerId, availableModel),
    );
    const firstVisibleModel = models.find(
      (availableModel) => !state.hiddenModelIds.includes(availableModel.id),
    );

    setProviderKeys((current) => ({
      ...current,
      [providerId]: {
        ...state,
        models,
      },
    }));
    if (!model && firstVisibleModel) {
      setProvider(providerId);
      setModel(firstVisibleModel.id);
      return;
    }

    if (provider !== providerId) return;

    if (models.length === 0) {
      setModel("");
      return;
    }

    if (firstVisibleModel) {
      setModel((currentModel) => {
        const selectedStillVisible = models.some(
          (availableModel) =>
            availableModel.id === currentModel &&
            !state.hiddenModelIds.includes(availableModel.id),
        );
        return selectedStillVisible ? currentModel : firstVisibleModel.id;
      });
    } else if (state.hiddenModelIds.includes(model)) {
      setModel("");
    }
  }

  function startNewConversation(updateRoute = true) {
    if (updateRoute) pushNewConversationRoute();
    setConversationId(null);
    setMessages([]);
    setError(null);
  }

  async function openConversation(nextConversationId: string, updateRoute = true) {
    if (updateRoute) pushConversationRoute(nextConversationId);
    setConversationId(nextConversationId);
    setLoadingMessages(true);
    setError(null);
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
      setLoadingMessages(false);
    }
  }

  function handleModelChange(value: string) {
    const [nextProvider, ...modelParts] = value.split(":");
    if ((nextProvider === "openai" || nextProvider === "deepseek") && modelParts.length > 0) {
      setProvider(nextProvider);
      setModel(modelParts.join(":"));
      setModelMenuOpen(false);
    }
  }

  function handleReasoningEffortChange(value: ReasoningEffort) {
    setReasoningEffort(value);
    setReasoningMenuOpen(false);
  }

  function handleMessagesScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    autoScrollRef.current = distanceFromBottom < 96;
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function stopResponse() {
    abortControllerRef.current?.abort();
  }

  async function confirmDeleteConversation() {
    if (!pendingDelete) return;

    try {
      await deleteConversation(vault, pendingDelete.id);
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to delete conversation.",
      );
      setPendingDelete(null);
      return;
    }

    setConversations((current) =>
      current.filter((conversation) => conversation.id !== pendingDelete.id),
    );

    if (conversationId === pendingDelete.id) {
      pushNewConversationRoute();
      setConversationId(null);
      setMessages([]);
      setError(null);
    }

    setPendingDelete(null);
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

  function acquireBusyLock() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }

  function releaseBusyLock() {
    busyRef.current = false;
    setBusy(false);
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

    if (!turnModel) {
      releaseHeldBusyLock();
      setSettingsOpen(true);
      setError("Test a provider key in Settings before choosing a model.");
      return;
    }

    const providerKeyState = providerKeys[turnProvider];
    if (!providerKeyState) {
      releaseHeldBusyLock();
      setSettingsOpen(true);
      setError(`Configure and test a ${formatProviderLabel(turnProvider)} API key first.`);
      return;
    }

    const apiKey = providerKeyState.apiKey.trim();
    if (!apiKey) {
      releaseHeldBusyLock();
      setSettingsOpen(true);
      setError(`Configure and test a ${formatProviderLabel(turnProvider)} API key first.`);
      return;
    }

    if (
      (pendingAttachments.length > 0 || reusedAttachments.length > 0) &&
      !supportsAttachments(turnProvider, turnModel)
    ) {
      releaseHeldBusyLock();
      setError("The selected model is not configured for file or image input.");
      return;
    }

    if (!lockHeld) {
      if (!acquireBusyLock()) return;
      lockHeld = true;
    }
    setError(null);
    autoScrollRef.current = true;

    let pendingAttachmentMap: Record<string, ChatAttachment>;
    try {
      pendingAttachmentMap = Object.fromEntries(
        await Promise.all(
          pendingAttachments.map(async (attachment) => [
            attachment.id,
            {
              id: attachment.id,
              fileName: attachment.file.name,
              mimeType: attachment.file.type || "application/octet-stream",
              sizeBytes: attachment.file.size,
              dataUrl: await fileToDataUrl(attachment.file),
            },
          ]),
        ),
      ) as Record<string, ChatAttachment>;
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to read attachments.",
      );
      releaseHeldBusyLock();
      return;
    }
    const reusedAttachmentMap = Object.fromEntries(
      reusedAttachments.map((attachment) => [attachment.id, attachment]),
    );
    const requestAttachmentMap = {
      ...reusedAttachmentMap,
      ...pendingAttachmentMap,
    };
    const attachmentMap = requestAttachmentMap;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      status: "pending",
      provider: turnProvider,
      model: turnModel,
      parts,
      attachments: attachmentMap,
      createdAt: new Date().toISOString(),
    };
    const completedUserMessage: ChatMessage = {
      ...userMessage,
      status: "completed",
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      status: "streaming",
      provider: turnProvider,
      model: turnModel,
      parts: [{ type: "markdown", text: "" }],
      createdAt: new Date().toISOString(),
    };

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

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const isNewConversation = !conversationId;
      const nextConversationId =
        conversationId ??
        (await createConversation(vault, title.slice(0, 80), turnProvider, turnModel));
      if (isNewConversation) createdConversationId = nextConversationId;
      setConversationId(nextConversationId);
      pushConversationRoute(nextConversationId);
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
      let streamedText = "";
      let latestUsage = undefined as ChatResponseStats["usage"] | undefined;
      statsTimer = window.setInterval(() => {
        if (!streamedText.trim()) return;
        const elapsedMs = Math.max(
          0,
          Math.round(performance.now() - responseStartedAt),
        );
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  responseStats: {
                    elapsedMs,
                    usage:
                      latestUsage ??
                      estimateUsageFromText(streamedText),
                  },
                }
              : message,
          ),
        );
      }, 250);
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
          streamedText += token;
          const elapsedMs = Math.max(
            0,
            Math.round(performance.now() - responseStartedAt),
          );
          const estimatedUsage = estimateUsageFromText(streamedText);
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    parts: appendTokenToMessageParts(message.parts, token),
                    responseStats: {
                      elapsedMs,
                      usage: latestUsage ?? estimatedUsage,
                    },
                  }
                : message,
            ),
          );
        },
        onUsage: (usage) => {
          latestUsage = usage;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    responseStats: {
                      elapsedMs: Math.max(
                        0,
                        Math.round(performance.now() - responseStartedAt),
                      ),
                      usage,
                    },
                  }
                : message,
            ),
          );
        },
      });

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
        await deleteMessages(vault, [assistantMessage.id]);
        assistantPersisted = false;
        await updateMessageStatus(
          userMessage.id,
          abortController.signal.aborted ? "cancelled" : "failed",
        ).catch(() => undefined);
        setMessages((current) =>
          current
            .filter((message) => message.id !== assistantMessage.id)
            .map((message) =>
              message.id === userMessage.id
                ? {
                    ...message,
                    status: abortController.signal.aborted
                      ? ("cancelled" as const)
                      : ("failed" as const),
                  }
                : message,
            ),
        );
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
      if (!assistantContentPersisted) {
        await updateMessageStatus(userMessage.id, "failed").catch(() => undefined);
      }
      if (assistantPersisted && !assistantContentPersisted) {
        await deleteMessages(vault, [assistantMessage.id]).catch(() => undefined);
      }
      if (createdConversationId && !userPersisted) {
        await deleteConversation(vault, createdConversationId).catch(() => undefined);
        setConversations((current) =>
          current.filter((conversation) => conversation.id !== createdConversationId),
        );
        setConversationId(null);
        pushNewConversationRoute();
      } else if (createdConversationId || conversationId) {
        await safeTouchConversation(createdConversationId ?? conversationId!);
      }
      setMessages((current) =>
        current
          .filter((message) => message.id !== assistantMessage.id)
          .map((message) =>
            message.id === userMessage.id && !assistantContentPersisted
              ? {
                  ...message,
                  status: "failed" as const,
                }
              : message,
          ),
      );
    } finally {
      if (statsTimer !== undefined) window.clearInterval(statsTimer);
      if (statsTimerRef.current === statsTimer) {
        statsTimerRef.current = undefined;
      }
      abortControllerRef.current = null;
      releaseHeldBusyLock();
    }
  }

  async function deleteUserTurn(userMessage: ChatMessage) {
    if (busyRef.current) return;

    const turnMessageIds = userTurnMessageIds(messages, userMessage.id);
    if (turnMessageIds.length === 0) return;

    if (!conversationId) {
      setMessages((current) =>
        current.filter((message) => !turnMessageIds.includes(message.id)),
      );
      return;
    }

    try {
      setError(null);
      await deleteMessages(vault, turnMessageIds);
      const nextMessages = messages.filter(
        (message) => !turnMessageIds.includes(message.id),
      );
      setMessages(nextMessages);
      await refreshConversationLastMessageAt(conversationId);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, updatedAt: new Date().toISOString() }
            : conversation,
        ),
      );
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to delete message.",
      );
    }
  }

  async function shareConversationSnapshot() {
    if (!conversationId || messages.length === 0 || busyRef.current) return;

    try {
      setError(null);
      setNotice(null);
      const shareMessages = await materializeMessagesForShare(messages);
      const url = await createConversationShare({
        conversationId,
        messages: shareMessages,
        title: activeConversationTitle,
        vault,
      });
      await copyShareUrl(url);
      setNotice("Conversation share link copied.");
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to share conversation.",
      );
    }
  }

  async function shareMessageTurn(message: ChatMessage) {
    if (!conversationId || busyRef.current) return;

    const turn = messageTurnPair(messages, message.id);
    if (!turn) {
      setError("A message can only be shared after its paired response is available.");
      return;
    }

    try {
      setError(null);
      setNotice(null);
      const shareMessages = await materializeMessagesForShare([
        turn.userMessage,
        turn.assistantMessage,
      ]);
      const url = await createMessageTurnShare({
        assistantMessageId: turn.assistantMessage.id,
        conversationId,
        messages: shareMessages,
        title: textFromParts(turn.userMessage.parts).trim() || "Shared message",
        userMessageId: turn.userMessage.id,
        vault,
      });
      await copyShareUrl(url);
      setNotice("Message share link copied.");
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to share message.",
      );
    }
  }

  async function materializeMessagesForShare(shareMessages: ChatMessage[]) {
    if (!conversationId) throw new Error("Conversation is not ready.");

    return Promise.all(
      shareMessages.map(async (message) => {
        const attachmentEntries = await Promise.all(
          attachmentIdsFromParts(message.parts).map(async (attachmentId) => {
            const attachment = message.attachments?.[attachmentId];
            if (!attachment) {
              throw new Error("Message attachment metadata is missing.");
            }

            return [
              attachmentId,
              {
                ...attachment,
                dataUrl:
                  attachment.dataUrl ??
                  (await encryptedAttachmentToDataUrl(
                    vault,
                    conversationId,
                    attachment,
                  )),
              },
            ] as const;
          }),
        );

        return {
          ...message,
          attachments:
            attachmentEntries.length > 0
              ? Object.fromEntries(attachmentEntries)
              : undefined,
        } satisfies ChatMessage;
      }),
    );
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

      if (!turnModel) {
        setSettingsOpen(true);
        setError("Test a provider key in Settings before choosing a model.");
        return;
      }

      const providerKeyState = providerKeys[turnProvider];
      if (!providerKeyState) {
        setSettingsOpen(true);
        setError(
          `Configure and test a ${formatProviderLabel(turnProvider)} API key first.`,
        );
        return;
      }

      const apiKey = providerKeyState.apiKey.trim();
      if (!apiKey) {
        setSettingsOpen(true);
        setError(
          `Configure and test a ${formatProviderLabel(turnProvider)} API key first.`,
        );
        return;
      }

      if (!acquireBusyLock()) return;
      const retryAttachments = await retryAttachmentsFromMessage(userMessage);
      if (
        (retryAttachments.reusedAttachments.length > 0 ||
          retryAttachments.pendingAttachments.length > 0) &&
        !supportsAttachments(turnProvider, turnModel)
      ) {
        releaseBusyLock();
        setError("The selected model is not configured for file or image input.");
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
        turnModel,
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

  async function retryAttachmentsFromMessage(userMessage: ChatMessage) {
    const attachmentParts = userMessage.parts.filter(
      (part): part is Extract<MessagePart, { type: "image" | "file" }> =>
        part.type === "image" || part.type === "file",
    );

    const attachments = await Promise.all(
      attachmentParts.map(async (part) => {
        const attachment = userMessage.attachments?.[part.attachmentId];
        if (!attachment) throw new Error("Message attachment metadata is missing.");

        let dataUrl = attachment.dataUrl;
        if (!dataUrl) {
          if (!conversationId) throw new Error("Conversation is not ready.");
          dataUrl = await encryptedAttachmentToDataUrl(
            vault,
            conversationId,
            attachment,
          );
        }
        if (!attachment.storagePath) {
          return {
            kind: "pending" as const,
            attachment: {
              id: attachment.id,
              file: await dataUrlToFile(
                dataUrl,
                attachment.fileName,
                attachment.mimeType,
              ),
              type: part.type,
            } satisfies PendingAttachment,
          };
        }

        return {
          kind: "reused" as const,
          attachment: {
            ...attachment,
            dataUrl,
          } satisfies ChatAttachment,
        };
      }),
    );

    return {
      pendingAttachments: attachments.flatMap((entry) =>
        entry.kind === "pending" ? [entry.attachment] : [],
      ),
      reusedAttachments: attachments.flatMap((entry) =>
        entry.kind === "reused" ? [entry.attachment] : [],
      ),
    };
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
      <aside className="side-panel">
        <div className="sidebar-header">
          {!sidebarCollapsed ? (
            <div className="sidebar-brand">
              <ShieldCheck size={18} />
              <strong>{env.appName}</strong>
            </div>
          ) : null}
          <button
            className="icon-button collapse-button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            type="button"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <button
          className={sidebarCollapsed ? "new-chat-button icon-only" : "new-chat-button"}
          onClick={() => startNewConversation()}
          type="button"
          aria-label="New chat"
        >
          <Plus size={16} />
          {!sidebarCollapsed ? "New chat" : null}
        </button>

        {!sidebarCollapsed ? (
          <div className="conversation-list">
            {conversations.length > 0 && (
              <ConversationList
                activeConversationId={conversationId}
                conversations={conversations}
                onDeleteConversation={setPendingDelete}
                onOpenConversation={(nextConversationId) => {
                  void openConversation(nextConversationId);
                }}
                variant="sidebar"
              />
            )}
          </div>
        ) : null}

        <div className="sidebar-actions">
          {conversations.length > 0 ? (
            <div className="mobile-conversations-menu" ref={mobileConversationsRef}>
              <button
                className="ghost-button mobile-conversations-button"
                onClick={() => {
                  setSettingsPopoverOpen(false);
                  setMobileConversationsOpen((value) => !value);
                }}
                type="button"
                aria-label="Conversations"
                aria-expanded={mobileConversationsOpen}
              >
                <List size={16} />
              </button>
              <div
                className={
                  mobileConversationsOpen
                    ? "mobile-conversations-popover open"
                    : "mobile-conversations-popover"
                }
                aria-hidden={!mobileConversationsOpen}
              >
                <ConversationList
                  activeConversationId={conversationId}
                  conversations={conversations}
                  onOpenConversation={(nextConversationId) => {
                    setMobileConversationsOpen(false);
                    void openConversation(nextConversationId);
                  }}
                  variant="popover"
                />
              </div>
            </div>
          ) : null}
          <SettingsPopover
            menuRef={settingsMenuRef}
            onConfigureProviders={() => {
              setSettingsOpen(true);
              setSettingsPopoverOpen(false);
            }}
            onLogout={onLogout}
            onOpenChange={(open) => {
              setMobileConversationsOpen(false);
              setSettingsPopoverOpen(open);
            }}
            open={settingsPopoverOpen}
            sidebarCollapsed={sidebarCollapsed}
            user={user}
          />
        </div>
      </aside>

      <div className="conversation">
        <header className="conversation-header">
          <strong>{activeConversationTitle}</strong>
          <div className="conversation-meta">
            <span>Context ≈{contextTokenEstimate.toLocaleString()} tokens</span>
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

        <div
          className="messages"
          aria-live="polite"
          onScroll={handleMessagesScroll}
          ref={messagesRef}
        >
          {loadingConversations || loadingMessages ? (
            <div className="empty-state">
              <h1>Loading conversation</h1>
              <p>Decrypting messages in this browser.</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <h1>Start a conversation</h1>
              <p>
                Configure and test a provider key in Settings. Available models
                will appear below the input.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <span>{message.role}</span>
                {message.role === "assistant" ? (
                  messageHasRenderableParts(message) ? (
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
                          loadAttachmentPreview={loadAttachmentPreview}
                          part={part}
                        />
                      ))}
                    </div>
                  ) : message.status === "pending" || message.status === "streaming" ? (
                    <div className="thinking-indicator" aria-label="Thinking">
                      Thinking
                    </div>
                  ) : null
                ) : (
                  <div className="user-message-row">
                    {message.status === "failed" ? (
                      <div className="message-failure-icon" aria-label="Send failed">
                        <CircleAlert size={15} />
                      </div>
                    ) : null}
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
                          loadAttachmentPreview={loadAttachmentPreview}
                          part={part}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {message.role === "user" ? (
                  <div className="message-actions">
                    <button
                      aria-label="Share message and response"
                      disabled={busy}
                      onClick={() => {
                        void shareMessageTurn(message);
                      }}
                      title="Share message and response"
                      type="button"
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      aria-label={
                        message.status === "pending"
                          ? "Sending message"
                          : "Retry message"
                      }
                      disabled={busy}
                      onClick={() => {
                        void retryUserTurn(message);
                      }}
                      title={message.status === "pending" ? "Sending" : "Retry"}
                      type="button"
                    >
                      <RotateCcw
                        className={
                          message.status === "pending" ? "spin" : undefined
                        }
                        size={14}
                      />
                    </button>
                    <button
                      aria-label="Delete message"
                      disabled={busy}
                      onClick={() => {
                        void deleteUserTurn(message);
                      }}
                      title="Delete"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
                {message.role === "assistant" ? (
                  <div className="assistant-message-meta">
                    <button
                      aria-label="Share message and response"
                      disabled={busy}
                      onClick={() => {
                        void shareMessageTurn(message);
                      }}
                      title="Share message and response"
                      type="button"
                    >
                      <Share2 size={14} />
                    </button>
                    {message.responseStats ? (
                      <div className="message-stats">
                        {formatResponseStats(message.responseStats)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>

        {error ? <div className="notice danger">{error}</div> : null}
        {notice ? <div className="notice success">{notice}</div> : null}

        <form className="composer" onSubmit={handleSubmit}>
          <div className="composer-box">
            {pendingFiles.length > 0 ? (
              <div className="pending-attachments">
                {pendingFiles.map((file, index) => (
                  <div className="pending-attachment" key={`${file.name}:${file.size}:${index}`}>
                    <span>{file.name}</span>
                    <button
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setPendingFiles((current) =>
                          current.filter((_, fileIndex) => fileIndex !== index),
                        )
                      }
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleDraftKeyDown}
              placeholder="Ask anything..."
              rows={3}
              value={draft}
            />
            <input
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setPendingFiles((current) => [...current, ...files]);
                event.target.value = "";
              }}
              ref={fileInputRef}
              type="file"
              hidden
            />
            <div className="composer-controls">
              <button
                aria-label="Attach files"
                className="attach-button"
                disabled={!selectedSupportsAttachments || busy}
                onClick={() => fileInputRef.current?.click()}
                title={
                  selectedSupportsAttachments
                    ? "Attach files"
                    : "Selected model does not support attachments"
                }
                type="button"
              >
                <Paperclip size={15} />
              </button>
              <div className="model-picker" ref={modelMenuRef}>
                <button
                  aria-expanded={modelMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Available model"
                  className="model-picker-button"
                  disabled={availableModels.length === 0}
                  onClick={() => {
                    setReasoningMenuOpen(false);
                    setModelMenuOpen((value) => !value);
                  }}
                  type="button"
                >
                  <span>{selectedModelLabel}</span>
                  <ChevronDown size={14} />
                </button>
                <div
                  className={modelMenuOpen ? "model-menu open" : "model-menu"}
                  role="listbox"
                  aria-hidden={!modelMenuOpen}
                >
                  {availableModels.map((item) => {
                    const value = `${item.provider}:${item.model.id}`;
                    const selected = value === selectedModelValue;
                    return (
                      <button
                        aria-selected={selected}
                        className={
                          selected ? "model-menu-item active" : "model-menu-item"
                        }
                        key={value}
                        onClick={() => handleModelChange(value)}
                        role="option"
                        type="button"
                      >
                        <span>{item.model.id}</span>
                        {item.model.description ? (
                          <small>{item.model.description}</small>
                        ) : null}
                        {selected ? <Check size={14} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                aria-label="Toggle thinking mode"
                aria-pressed={thinkingMode === "enabled"}
                className={
                  thinkingMode === "enabled"
                    ? "request-toggle active"
                    : "request-toggle"
                }
                disabled={busy}
                onClick={() =>
                  setThinkingMode((current) =>
                    current === "enabled" ? "disabled" : "enabled",
                  )
                }
                title="Thinking"
                type="button"
              >
                <Brain size={14} />
                <span>Thinking</span>
              </button>
              <div className="request-picker" ref={reasoningMenuRef}>
                <button
                  aria-expanded={reasoningMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Reasoning effort"
                  className="request-picker-button"
                  disabled={busy}
                  onClick={() => {
                    setModelMenuOpen(false);
                    setReasoningMenuOpen((value) => !value);
                  }}
                  type="button"
                >
                  <Gauge size={14} />
                  <span>Reasoning</span>
                  <small>
                    {
                      reasoningEffortOptions.find(
                        (option) => option.value === reasoningEffort,
                      )?.label
                    }
                  </small>
                  <ChevronDown size={14} />
                </button>
                <div
                  className={
                    reasoningMenuOpen ? "request-menu open" : "request-menu"
                  }
                  role="listbox"
                  aria-hidden={!reasoningMenuOpen}
                >
                  {reasoningEffortOptions.map((option) => {
                    const selected = option.value === reasoningEffort;
                    return (
                      <button
                        aria-selected={selected}
                        className={
                          selected ? "request-menu-item active" : "request-menu-item"
                        }
                        key={option.value}
                        onClick={() => handleReasoningEffortChange(option.value)}
                        role="option"
                        type="button"
                      >
                        <span>{option.label}</span>
                        {selected ? <Check size={14} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                className={busy ? "send-button stop-button" : "send-button"}
                disabled={!busy && !draft.trim() && pendingFiles.length === 0}
                onClick={busy ? stopResponse : undefined}
                type={busy ? "button" : "submit"}
                aria-label={busy ? "Stop response" : "Send message"}
              >
                <span className="send-icon-stack" aria-hidden="true">
                  <span className={busy ? "send-icon inactive" : "send-icon active"}>
                    <Send size={16} />
                  </span>
                  <span className={busy ? "send-icon active" : "send-icon inactive"}>
                    <Square size={13} fill="currentColor" />
                  </span>
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>

      <SettingsModal
        open={settingsOpen}
        vault={vault}
        providerKeys={providerKeys}
        onClose={() => setSettingsOpen(false)}
        onProviderKeyChange={updateProviderKey}
      />

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

function upsertConversation(
  conversations: ConversationListItem[],
  next: ConversationListItem,
) {
  const withoutCurrent = conversations.filter((item) => item.id !== next.id);
  return [next, ...withoutCurrent];
}

function bumpConversation(
  conversations: ConversationListItem[],
  conversationId: string,
) {
  const current = conversations.find((item) => item.id === conversationId);
  if (!current) return conversations;

  return [
    {
      ...current,
      updatedAt: new Date().toISOString(),
    },
    ...conversations.filter((item) => item.id !== conversationId),
  ];
}

async function safeTouchConversation(conversationId: string) {
  await touchConversation(conversationId).catch(() => undefined);
}

async function settleInterruptedAssistantMessages(
  vault: Pick<UnlockedVault, "userId">,
  messages: ChatMessage[],
  conversationId: string,
) {
  const emptyInterruptedAssistantIds = new Set<string>();
  const renderableInterruptedAssistantIds = new Set<string>();
  const completedUserIds = new Set<string>();
  const failedUserIds = new Set<string>();

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      message.role === "assistant" &&
      (message.status === "pending" || message.status === "streaming")
    ) {
      if (messageHasRenderableParts(message)) {
        renderableInterruptedAssistantIds.add(message.id);
      } else {
        emptyInterruptedAssistantIds.add(message.id);
      }
    }

    if (
      message.role === "user" &&
      (message.status === "pending" || message.status === "completed")
    ) {
      const nextMessage = messages[index + 1];
      if (nextMessage?.role === "assistant") {
        const nextAssistantIsEmptyInterruption =
          (nextMessage.status === "pending" || nextMessage.status === "streaming") &&
          !messageHasRenderableParts(nextMessage);
        if (message.status === "pending" && !nextAssistantIsEmptyInterruption) {
          completedUserIds.add(message.id);
        }
      } else {
        failedUserIds.add(message.id);
      }
      continue;
    }

    if (!emptyInterruptedAssistantIds.has(message.id)) continue;

    const previousMessage = messages[index - 1];
    if (previousMessage?.role === "user") {
      failedUserIds.add(previousMessage.id);
    }
  }

  if (
    emptyInterruptedAssistantIds.size === 0 &&
    renderableInterruptedAssistantIds.size === 0 &&
    completedUserIds.size === 0 &&
    failedUserIds.size === 0
  ) {
    return messages;
  }

  let nextMessages = messages;
  let deletedEmptyAssistants = false;

  if (emptyInterruptedAssistantIds.size > 0) {
    try {
      await deleteMessages(vault, [...emptyInterruptedAssistantIds]);
      nextMessages = nextMessages.filter(
        (message) => !emptyInterruptedAssistantIds.has(message.id),
      );
      deletedEmptyAssistants = true;
    } catch {
      // Delete failed for empty assistants; continue with remaining settlement
      // so renderable assistants and failed users are still processed.
    }
  }

  for (const messageId of renderableInterruptedAssistantIds) {
    try {
      await updateMessageStatus(messageId, "cancelled");
      nextMessages = nextMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              status: "cancelled" as const,
            }
          : message,
      );
    } catch {
      // Keep local state aligned with DB; a future reload can retry settlement.
    }
  }

  for (const messageId of completedUserIds) {
    try {
      await updateMessageStatus(messageId, "completed");
      nextMessages = nextMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              status: "completed" as const,
            }
          : message,
      );
    } catch {
      // Keep local state aligned with DB; a future reload can retry settlement.
    }
  }

  for (const messageId of failedUserIds) {
    try {
      await updateMessageStatus(messageId, "failed");
      nextMessages = nextMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              status: "failed" as const,
            }
          : message,
      );
    } catch {
      // Keep local state aligned with DB; a future reload can retry settlement.
    }
  }

  if (deletedEmptyAssistants) {
    await refreshConversationLastMessageAt(conversationId).catch(() => undefined);
  }

  return nextMessages;
}

function appendTokenToMessageParts(parts: ChatMessage["parts"], token: string): MessagePart[] {
  const nextParts = [...parts];
  const lastPart = nextParts[nextParts.length - 1];

  if (lastPart?.type === "markdown") {
    nextParts[nextParts.length - 1] = {
      ...lastPart,
      text: lastPart.text + token,
    };
    return nextParts;
  }

  return [...nextParts, { type: "markdown" as const, text: token }];
}

function messageHasRenderableParts(message: ChatMessage) {
  return message.parts.some((part) => {
    if (part.type === "text" || part.type === "markdown") {
      return part.text.trim().length > 0;
    }

    return true;
  });
}

function orderedMessageParts(parts: MessagePart[]) {
  const attachments = parts.filter(
    (part) => part.type === "image" || part.type === "file",
  );
  const rest = parts.filter((part) => part.type !== "image" && part.type !== "file");
  return [...attachments, ...rest];
}

function messageHasAttachmentsAndBody(parts: MessagePart[]) {
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

function userTurnMessageIds(messages: ChatMessage[], userMessageId: string) {
  const userMessageIndex = messages.findIndex(
    (message) => message.id === userMessageId,
  );
  if (userMessageIndex < 0 || messages[userMessageIndex]?.role !== "user") return [];

  const nextMessage = messages[userMessageIndex + 1];
  return nextMessage?.role === "assistant"
    ? [userMessageId, nextMessage.id]
    : [userMessageId];
}

function messageTurnPair(messages: ChatMessage[], messageId: string) {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return null;

  const message = messages[index];
  if (message?.role === "user") {
    const assistantMessage = messages[index + 1];
    if (assistantMessage?.role !== "assistant") return null;
    return {
      userMessage: message,
      assistantMessage,
    };
  }

  if (message?.role === "assistant") {
    const userMessage = messages[index - 1];
    if (userMessage?.role !== "user") return null;
    return {
      userMessage,
      assistantMessage: message,
    };
  }

  return null;
}

function attachmentIdsFromParts(parts: MessagePart[]) {
  return [
    ...new Set(
      parts.flatMap((part) =>
        part.type === "image" || part.type === "file" ? [part.attachmentId] : [],
      ),
    ),
  ];
}

async function copyShareUrl(url: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = url;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function cloneMessageParts(parts: MessagePart[]) {
  return parts.map((part) => ({ ...part })) as MessagePart[];
}

function estimateContextTokens(
  messages: ChatMessage[],
  draft: string,
  pendingFiles: File[],
) {
  const messageTokens = messages.reduce((total, message) => {
    const textTokens = message.parts.reduce((partTotal, part) => {
      if (part.type === "text" || part.type === "markdown") {
        return partTotal + estimateTokenCount(part.text);
      }
      if (part.type === "json") {
        return partTotal + estimateTokenCount(JSON.stringify(part.value));
      }
      if (part.type === "tool_call" || part.type === "tool_result") {
        return partTotal + estimateTokenCount(JSON.stringify(part));
      }
      return partTotal;
    }, 0);
    const attachmentTokens = Object.values(message.attachments ?? {}).reduce(
      (attachmentTotal, attachment) =>
        attachmentTotal + estimateAttachmentTokens(attachment.mimeType),
      0,
    );

    return total + textTokens + attachmentTokens + 4;
  }, 0);

  const draftTokens = estimateTokenCount(draft);
  const pendingFileTokens = pendingFiles.reduce(
    (total, file) => total + estimateAttachmentTokens(file.type),
    0,
  );

  return messageTokens + draftTokens + pendingFileTokens;
}

function estimateAttachmentTokens(mimeType: string) {
  if (mimeType.startsWith("image/")) return 256;
  return 64;
}

function formatResponseStats(stats: ChatResponseStats) {
  const values = [formatDuration(stats.elapsedMs)];
  const totalTokens = stats.usage?.totalTokens;

  if (typeof totalTokens === "number") {
    values.push(`${totalTokens.toLocaleString()} tokens`);
  }

  return values.join(" · ");
}

function estimateUsageFromText(text: string) {
  return {
    totalTokens: estimateTokenCount(text),
  };
}

function estimateTokenCount(text: string) {
  if (!text.trim()) return 0;

  const cjkCharacters = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const nonCjkText = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ");
  const wordLikeTokens = nonCjkText.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;

  return Math.max(1, Math.ceil(cjkCharacters + wordLikeTokens * 1.3));
}

function formatDuration(elapsedMs: number) {
  if (elapsedMs < 1000) return `${elapsedMs}ms`;
  return `${(elapsedMs / 1000).toFixed(elapsedMs < 10000 ? 1 : 0)}s`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file."));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, fileName: string, mimeType: string) {
  const separatorIndex = dataUrl.indexOf(",");
  if (separatorIndex < 0) throw new Error("Invalid attachment data URL.");

  const header = dataUrl.slice(0, separatorIndex);
  const payload = dataUrl.slice(separatorIndex + 1);
  const decoded = header.includes(";base64")
    ? atob(payload)
    : decodeURIComponent(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return new File([bytes], fileName, {
    type: mimeType || parseDataUrlMimeType(header) || "application/octet-stream",
  });
}

function parseDataUrlMimeType(header: string) {
  const match = /^data:([^;,]+)/.exec(header);
  return match?.[1] ?? "";
}

function hiddenModelsStorageKey(userId: string, provider: ProviderId) {
  return `salty:hidden-models:${userId}:${provider}`;
}

function loadHiddenModelIds(userId: string, provider: ProviderId) {
  if (typeof window === "undefined") return [];

  try {
    const value = window.localStorage.getItem(hiddenModelsStorageKey(userId, provider));
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function saveHiddenModelIds(
  userId: string,
  provider: ProviderId,
  hiddenModelIds: string[],
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    hiddenModelsStorageKey(userId, provider),
    JSON.stringify([...new Set(hiddenModelIds)]),
  );
}
