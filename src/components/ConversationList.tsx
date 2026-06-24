import { Trash2 } from "lucide-react";
import type { ConversationListItem } from "@/lib/conversations";

type ConversationListProps = {
  activeConversationId: string | null;
  conversations: ConversationListItem[];
  onDeleteConversation?: (conversation: ConversationListItem) => void;
  onOpenConversation: (conversationId: string) => void;
  variant: "sidebar" | "popover";
};

export function ConversationList({
  activeConversationId,
  conversations,
  onDeleteConversation,
  onOpenConversation,
  variant,
}: ConversationListProps) {
  const isPopover = variant === "popover";

  return (
    <>
      {conversations.map((conversation) => {
        const active = conversation.id === activeConversationId;

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
          >
            <button
              className="conversation-select"
              onClick={() => onOpenConversation(conversation.id)}
              type="button"
            >
              <span>{conversation.title}</span>
            </button>
            {onDeleteConversation ? (
              <button
                className="conversation-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteConversation(conversation);
                }}
                type="button"
                aria-label={`Delete ${conversation.title}`}
              >
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
