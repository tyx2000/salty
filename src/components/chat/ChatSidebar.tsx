import type { RefObject } from "react";
import type { User } from "@supabase/supabase-js";
import {
  List,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { ConversationListItem } from "@/lib/conversations";
import { ConversationList } from "@/components/ConversationList";
import { SettingsPopover } from "@/components/SettingsPopover";

type ChatSidebarProps = {
  activeConversationId: string | null;
  appName: string;
  conversations: ConversationListItem[];
  editingConversationId: string | null;
  mobileConversationsOpen: boolean;
  mobileConversationsRef: RefObject<HTMLDivElement | null>;
  onContextMenu: (conversation: ConversationListItem, x: number, y: number) => void;
  onLogout: () => void;
  onOpenConversation: (conversationId: string) => void;
  onRenameSubmit: (conversationId: string, title: string) => void;
  onSettingsPopoverOpenChange: (open: boolean) => void;
  onStartNewConversation: () => void;
  onToggleMobileConversations: () => void;
  onToggleSidebar: () => void;
  returnTo: string;
  settingsMenuRef: RefObject<HTMLDivElement | null>;
  settingsPopoverOpen: boolean;
  sidebarCollapsed: boolean;
  user: User;
};

export function ChatSidebar({
  activeConversationId,
  appName,
  conversations,
  editingConversationId,
  mobileConversationsOpen,
  mobileConversationsRef,
  onContextMenu,
  onLogout,
  onOpenConversation,
  onRenameSubmit,
  onSettingsPopoverOpenChange,
  onStartNewConversation,
  onToggleMobileConversations,
  onToggleSidebar,
  returnTo,
  settingsMenuRef,
  settingsPopoverOpen,
  sidebarCollapsed,
  user,
}: ChatSidebarProps) {
  return (
    <aside className="side-panel">
      <div className="sidebar-header">
        {!sidebarCollapsed ? (
          <div className="sidebar-brand">
            <ShieldCheck size={18} />
            <strong>{appName}</strong>
          </div>
        ) : null}
        <button
          className="icon-button collapse-button"
          onClick={onToggleSidebar}
          type="button"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <button
        className={sidebarCollapsed ? "new-chat-button icon-only" : "new-chat-button"}
        onClick={onStartNewConversation}
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
              activeConversationId={activeConversationId}
              conversations={conversations}
              editingConversationId={editingConversationId}
              onContextMenu={onContextMenu}
              onOpenConversation={onOpenConversation}
              onRenameSubmit={onRenameSubmit}
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
              onClick={onToggleMobileConversations}
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
                activeConversationId={activeConversationId}
                conversations={conversations}
                onOpenConversation={onOpenConversation}
                variant="popover"
              />
            </div>
          </div>
        ) : null}
        <SettingsPopover
          menuRef={settingsMenuRef}
          onLogout={onLogout}
          onOpenChange={onSettingsPopoverOpenChange}
          open={settingsPopoverOpen}
          returnTo={returnTo}
          sidebarCollapsed={sidebarCollapsed}
          user={user}
        />
      </div>
    </aside>
  );
}
