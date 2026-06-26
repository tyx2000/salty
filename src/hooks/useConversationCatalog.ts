import { useEffect, useState } from "react";
import {
  deleteConversation,
  loadConversations,
  updateConversationTitle,
  type ConversationListItem,
} from "@/lib/conversations";
import { flushPendingAttachmentStorageRemovals } from "@/lib/attachmentStorage";
import type { UnlockedVault } from "@/lib/vault";

type UseConversationCatalogOptions = {
  activeConversationId: string | null;
  onActiveConversationDeleted: () => void;
  onError: (message: string | null) => void;
  vault: UnlockedVault;
};

export function useConversationCatalog({
  activeConversationId,
  onActiveConversationDeleted,
  onError,
  vault,
}: UseConversationCatalogOptions) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    conversation: ConversationListItem;
    x: number;
    y: number;
  } | null>(null);
  const [editingConversationId, setEditingConversationId] = useState<
    string | null
  >(null);
  const [pendingDelete, setPendingDelete] =
    useState<ConversationListItem | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadExistingConversations() {
      setLoadingConversations(true);
      onError("");

      try {
        await flushPendingAttachmentStorageRemovals(vault.userId);
        const rows = await loadConversations(vault);
        if (!cancelled) {
          setConversations(rows);
        }
      } catch (unknownError) {
        if (!cancelled) {
          onError(
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
  }, [onError, vault]);

  function handleConversationContextMenu(
    conversation: ConversationListItem,
    x: number,
    y: number,
  ) {
    setContextMenu({ conversation, x, y });
  }

  function handleContextMenuEdit() {
    if (!contextMenu) return;
    setEditingConversationId(contextMenu.conversation.id);
    setContextMenu(null);
  }

  function handleContextMenuDelete() {
    if (!contextMenu) return;
    setPendingDelete(contextMenu.conversation);
    setContextMenu(null);
  }

  async function handleRenameSubmit(
    conversationId: string,
    title: string,
  ) {
    setEditingConversationId(null);
    const trimmed = title.trim();
    if (!trimmed) return;

    try {
      await updateConversationTitle(vault, conversationId, trimmed);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, title: trimmed, updatedAt: new Date().toISOString() }
            : conversation,
        ),
      );
    } catch (unknownError) {
      onError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to rename conversation.",
      );
    }
  }

  async function confirmDeleteConversation() {
    if (!pendingDelete) return;

    try {
      await deleteConversation(vault, pendingDelete.id);
    } catch (unknownError) {
      onError(
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

    if (activeConversationId === pendingDelete.id) {
      onActiveConversationDeleted();
    }

    if (editingConversationId === pendingDelete.id) {
      setEditingConversationId(null);
    }

    setPendingDelete(null);
  }

  return {
    clearEditingConversation: () => setEditingConversationId(null),
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
  };
}
