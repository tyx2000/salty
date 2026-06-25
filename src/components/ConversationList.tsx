import type { KeyboardEvent, MouseEvent } from "react";
import type { ConversationListItem } from "@/lib/conversations";

type ConversationListProps = {
  activeConversationId: string | null;
  conversations: ConversationListItem[];
  editingConversationId?: string | null;
  onContextMenu?: (conversation: ConversationListItem, x: number, y: number) => void;
  onOpenConversation: (conversationId: string) => void;
  onRenameSubmit?: (conversationId: string, title: string) => void;
  variant: "sidebar" | "popover";
};

export function ConversationList({
  activeConversationId,
  conversations,
  editingConversationId,
  onContextMenu,
  onOpenConversation,
  onRenameSubmit,
  variant,
}: ConversationListProps) {
  const isPopover = variant === "popover";

  function openContextMenu(
    conversation: ConversationListItem,
    x: number,
    y: number,
  ) {
    onContextMenu?.(conversation, x, y);
  }

  function handleContextMenu(
    event: MouseEvent,
    conversation: ConversationListItem,
  ) {
    event.preventDefault();
    openContextMenu(conversation, event.clientX, event.clientY);
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    conversation: ConversationListItem,
  ) {
    // Shift+F10 or the Menu key trigger the context menu
    if (
      event.key === "ContextMenu" ||
      (event.key === "F10" && event.shiftKey)
    ) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openContextMenu(conversation, rect.left, rect.bottom);
    }
  }

  function handleRenameKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    conversationId: string,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      onRenameSubmit?.(conversationId, event.currentTarget.value.trim());
    } else if (event.key === "Escape") {
      onRenameSubmit?.(conversationId, "");
    }
  }

  function handleRenameBlur(
    event: React.FocusEvent<HTMLInputElement>,
    conversationId: string,
  ) {
    onRenameSubmit?.(conversationId, event.currentTarget.value.trim());
  }

  return (
    <>
      {conversations.map((conversation) => {
        const active = conversation.id === activeConversationId;
        const editing = conversation.id === editingConversationId;

        if (isPopover) {
          return (
            <button
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "mobile-conversation-item active"
                  : "mobile-conversation-item"
              }
              key={conversation.id}
              onClick={() => onOpenConversation(conversation.id)}
              type="button"
            >
              <span>{conversation.title}</span>
            </button>
          );
        }

        return (
          <div
            className={active ? "conversation-row active" : "conversation-row"}
            key={conversation.id}
            onContextMenu={(event) => handleContextMenu(event, conversation)}
            onKeyDown={(event) => handleRowKeyDown(event, conversation)}
            role="button"
            tabIndex={0}
            aria-haspopup="menu"
            aria-label={`${conversation.title} — right-click or press Shift+F10 for actions`}
          >
            {editing ? (
              <input
                autoFocus
                className="conversation-rename-input"
                defaultValue={conversation.title}
                onBlur={(event) => handleRenameBlur(event, conversation.id)}
                onContextMenu={(event) => event.stopPropagation()}
                onKeyDown={(event) =>
                  handleRenameKeyDown(event, conversation.id)
                }
              />
            ) : (
              <button
                className="conversation-select"
                onClick={() => onOpenConversation(conversation.id)}
                tabIndex={-1}
                type="button"
              >
                <span>{conversation.title}</span>
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
