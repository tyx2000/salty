import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { ConversationListItem } from "@/lib/conversations";

/** Props for rendering conversation rows in the sidebar or mobile popover. */
type ConversationListProps = {
  /** Conversation currently loaded in the main panel. */
  activeConversationId: string | null;
  /** Ordered conversations to display. */
  conversations: ConversationListItem[];
  /** Conversation currently shown as an inline rename input. */
  editingConversationId?: string | null;
  /** Opens the row context menu from mouse or keyboard interaction. */
  onContextMenu?: (conversation: ConversationListItem, x: number, y: number) => void;
  /** Loads a conversation when its row is selected. */
  onOpenConversation: (conversationId: string) => void;
  /** Persists or cancels an inline rename. */
  onRenameSubmit?: (conversationId: string, title: string) => void;
  /** Selects desktop row styling or compact mobile popover styling. */
  variant: "sidebar" | "popover";
};

/** Displays selectable conversation rows, including rename and context-menu affordances. */
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
  const activeRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isPopover || !activeConversationId) return;

    activeRowRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeConversationId, conversations.length, isPopover]);

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
            ref={active ? activeRowRef : undefined}
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
