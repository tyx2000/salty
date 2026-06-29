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

/** Props for the left navigation rail that shows conversations and account access. */
type ChatSidebarProps = {
  /** Conversation currently loaded in the main chat panel. */
  activeConversationId: string | null;
  /** Product name shown in the expanded sidebar header. */
  appName: string;
  /** Ordered conversation list rendered in desktop and mobile menus. */
  conversations: ConversationListItem[];
  /** Conversation currently being renamed inline. */
  editingConversationId: string | null;
  /** Whether the mobile conversation popover is visible. */
  mobileConversationsOpen: boolean;
  /** Popover container ref used for outside-click dismissal. */
  mobileConversationsRef: RefObject<HTMLDivElement | null>;
  /** Opens the conversation context menu at the pointer position. */
  onContextMenu: (conversation: ConversationListItem, x: number, y: number) => void;
  /** Signs the current user out. */
  onLogout: () => void;
  /** Loads a conversation into the main chat panel. */
  onOpenConversation: (conversationId: string) => void;
  /** Persists an inline conversation title rename. */
  onRenameSubmit: (conversationId: string, title: string) => void;
  /** Shows or hides the profile/settings popover. */
  onSettingsPopoverOpenChange: (open: boolean) => void;
  /** Resets the main panel to a new empty chat. */
  onStartNewConversation: () => void;
  /** Shows or hides the mobile conversation picker. */
  onToggleMobileConversations: () => void;
  /** Collapses or expands the desktop sidebar. */
  onToggleSidebar: () => void;
  /** Route that settings pages should return to. */
  returnTo: string;
  /** Settings popover container ref used for outside-click dismissal. */
  settingsMenuRef: RefObject<HTMLDivElement | null>;
  /** Whether the profile/settings popover is visible. */
  settingsPopoverOpen: boolean;
  /** Whether the sidebar is in icon-only mode. */
  sidebarCollapsed: boolean;
  /** Authenticated Supabase user shown in the account area. */
  user: User;
};

/** Displays the app sidebar, conversation navigation, and account/settings entry. */
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
