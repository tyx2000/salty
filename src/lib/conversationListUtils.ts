import type { ConversationListItem } from "@/lib/conversations";

export function upsertConversation(
  conversations: ConversationListItem[],
  next: ConversationListItem,
) {
  const withoutCurrent = conversations.filter((item) => item.id !== next.id);
  return [next, ...withoutCurrent];
}

export function bumpConversation(
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
