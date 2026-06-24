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
  saveMessage,
} from "@/lib/messages";
import type { PendingAttachment } from "@/lib/messages";
import { streamChat, testProviderKey } from "@/lib/chatApi";
import { env } from "@/lib/env";
import { enrichProviderModel, supportsAttachments } from "@/lib/modelCapabilities";
import {
  emptyProviderKeyState,
  loadEncryptedProviderKeys,
} from "@/lib/providerKeys";
import type { UnlockedVault } from "@/lib/vault";
import { ConversationList } from "./ConversationList";
import { MessagePartRenderer } from "./MessagePartRenderer";
import { SettingsModal } from "./SettingsModal";
import { SettingsPopover } from "./SettingsPopover";

const providerLabels: Record<ProviderId, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

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
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileConversationsRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoScrollRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    let cancelled = false;

    async function loadExistingConversations() {
      setLoadingConversations(true);
      setError(null);

      try {
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
      setMessages(await loadMessages(vault, nextConversationId));
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
      await deleteConversation(pendingDelete.id);
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
    if ((!draft.trim() && pendingFiles.length === 0) || busy) return;

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
    afterUserMessageSaved,
  }: {
    parts: MessagePart[];
    pendingAttachments?: PendingAttachment[];
    reusedAttachments?: ChatAttachment[];
    title: string;
    historyMessages?: ChatMessage[];
    turnProvider?: ProviderId;
    turnModel?: string;
    clearComposer?: boolean;
    afterUserMessageSaved?: (userMessage: ChatMessage) => Promise<void>;
  }) {
    if (!turnModel) {
      setSettingsOpen(true);
      setError("Test a provider key in Settings before choosing a model.");
      return;
    }

    const apiKey = providerKeys[turnProvider].apiKey.trim();
    if (!apiKey) {
      setSettingsOpen(true);
      setError(`Configure and test a ${providerLabels[turnProvider]} API key first.`);
      return;
    }

    if (
      (pendingAttachments.length > 0 || reusedAttachments.length > 0) &&
      !supportsAttachments(turnProvider, turnModel)
    ) {
      setError("The selected model is not configured for file or image input.");
      return;
    }

    setBusy(true);
    setError(null);
    autoScrollRef.current = true;

    const pendingAttachmentMap = Object.fromEntries(
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
      status: "completed",
      provider: turnProvider,
      model: turnModel,
      parts,
      attachments: attachmentMap,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      status: "streaming",
      provider: turnProvider,
      model: turnModel,
      parts: [{ type: "markdown", text: "" }],
      responseStats: {
        elapsedMs: 0,
        usage: {
          totalTokens: 0,
        },
      },
      createdAt: new Date().toISOString(),
    };

    if (clearComposer) {
      setDraft("");
      setPendingFiles([]);
    }
    setMessages([...historyMessages, userMessage, assistantMessage]);

    let statsTimer: number | undefined;

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const responseStartedAt = performance.now();
      let streamedText = "";
      let latestUsage = undefined as ChatResponseStats["usage"] | undefined;
      statsTimer = window.setInterval(() => {
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
      const isNewConversation = !conversationId;
      const nextConversationId =
        conversationId ??
        (await createConversation(vault, title.slice(0, 80), turnProvider, turnModel));
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

      await saveMessage(vault, userMessage, nextConversationId, turnProvider, {
        model: turnModel,
        pendingAttachments,
        existingAttachmentIds: reusedAttachments.map((attachment) => attachment.id),
      });
      await afterUserMessageSaved?.(userMessage);

      const { text: assistantText, stats } = await streamChat({
        provider: turnProvider,
        model: turnModel,
        apiKey,
        thinkingMode,
        reasoningEffort,
        messages: [
          ...historyMessages,
          {
            ...userMessage,
            attachments: {
              ...userMessage.attachments,
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

      if (assistantText.trim()) {
        await saveMessage(
          vault,
          {
            ...assistantMessage,
            status: abortController.signal.aborted ? "cancelled" : "completed",
            parts: [{ type: "markdown", text: assistantText }],
            responseStats: stats,
          },
          nextConversationId,
          turnProvider,
          { model: turnModel },
        );
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                status: abortController.signal.aborted ? "cancelled" : "completed",
                responseStats: stats,
              }
            : message,
        ),
      );
      await touchConversation(nextConversationId);
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Chat request failed.",
      );
      setMessages((current) =>
        current.filter((message) => message.id !== assistantMessage.id),
      );
    } finally {
      if (statsTimer !== undefined) window.clearInterval(statsTimer);
      abortControllerRef.current = null;
      setBusy(false);
    }
  }

  async function deleteUserTurn(userMessage: ChatMessage) {
    if (!conversationId || busy) return;

    const turnMessageIds = userTurnMessageIds(messages, userMessage.id);
    if (turnMessageIds.length === 0) return;

    try {
      setError(null);
      await deleteMessages(turnMessageIds);
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

  async function retryUserTurn(userMessage: ChatMessage) {
    if (!conversationId || busy) return;

    const turnMessageIds = userTurnMessageIds(messages, userMessage.id);
    if (turnMessageIds.length === 0) return;

    try {
      setError(null);
      const turnProvider = userMessage.provider ?? provider;
      const turnModel = userMessage.model ?? model;

      if (!turnModel) {
        setSettingsOpen(true);
        setError("Test a provider key in Settings before choosing a model.");
        return;
      }

      const apiKey = providerKeys[turnProvider].apiKey.trim();
      if (!apiKey) {
        setSettingsOpen(true);
        setError(
          `Configure and test a ${providerLabels[turnProvider]} API key first.`,
        );
        return;
      }

      const retryAttachments = await reusableAttachmentsFromMessage(userMessage);
      if (
        retryAttachments.length > 0 &&
        !supportsAttachments(turnProvider, turnModel)
      ) {
        setError("The selected model is not configured for file or image input.");
        return;
      }

      const retryHistory = messages.filter(
        (message) => !turnMessageIds.includes(message.id),
      );
      await sendUserTurn({
        parts: cloneMessageParts(userMessage.parts),
        reusedAttachments: retryAttachments,
        title: textFromMessage(userMessage) || "Retried message",
        historyMessages: retryHistory,
        turnProvider,
        turnModel,
        afterUserMessageSaved: async () => {
          await deleteMessages(turnMessageIds);
          await refreshConversationLastMessageAt(conversationId);
        },
      });
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to retry message.",
      );
    }
  }

  async function reusableAttachmentsFromMessage(userMessage: ChatMessage) {
    if (!conversationId) throw new Error("Conversation is not ready.");

    const attachmentParts = userMessage.parts.filter(
      (part): part is Extract<MessagePart, { type: "image" | "file" }> =>
        part.type === "image" || part.type === "file",
    );

    return Promise.all(
      attachmentParts.map(async (part) => {
        const attachment = userMessage.attachments?.[part.attachmentId];
        if (!attachment) throw new Error("Message attachment metadata is missing.");

        const dataUrl =
          attachment.dataUrl ??
          (await encryptedAttachmentToDataUrl(
            vault,
            conversationId,
            attachment,
          ));
        return {
          ...attachment,
          dataUrl,
        } satisfies ChatAttachment;
      }),
    );
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
            <span>{model ? model : "No model selected"}</span>
            <span>Context ≈{contextTokenEstimate.toLocaleString()} tokens</span>
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
                  ) : (
                    <div className="thinking-indicator" aria-label="Thinking">
                      Thinking
                    </div>
                  )
                ) : (
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
                )}
                {message.role === "user" ? (
                  <div className="message-actions">
                    <button
                      aria-label="Retry message"
                      disabled={busy}
                      onClick={() => {
                        void retryUserTurn(message);
                      }}
                      title="Retry"
                      type="button"
                    >
                      <RotateCcw size={14} />
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
                {message.role === "assistant" &&
                message.responseStats ? (
                  <div className="message-stats">
                    {formatResponseStats(message.responseStats)}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>

        {error ? <div className="notice danger">{error}</div> : null}

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

function cloneMessageParts(parts: MessagePart[]) {
  return parts.map((part) => ({ ...part })) as MessagePart[];
}

function textFromMessage(message: ChatMessage) {
  return message.parts
    .flatMap((part) => {
      if (part.type === "text" || part.type === "markdown") return [part.text];
      return [];
    })
    .join("\n\n")
    .trim();
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
