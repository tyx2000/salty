import type { RefObject } from "react";
import type { User } from "@supabase/supabase-js";
import { Link } from "react-router";
import { Bot, Gauge, LogOut, Settings, UserRound } from "lucide-react";

type SettingsPopoverProps = {
  menuRef: RefObject<HTMLDivElement | null>;
  onLogout: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  returnTo: string;
  sidebarCollapsed: boolean;
  user: User;
};

export function SettingsPopover({
  menuRef,
  onLogout,
  onOpenChange,
  open,
  returnTo,
  sidebarCollapsed,
  user,
}: SettingsPopoverProps) {
  const settingsLinkState = { returnTo };

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        className="ghost-button full-width"
        onClick={() => onOpenChange(!open)}
        type="button"
        aria-label="Settings"
        aria-expanded={open}
      >
        <UserRound size={16} />
        {!sidebarCollapsed ? <span>{user.email}</span> : null}
      </button>
      <div
        className={open ? "settings-popover open" : "settings-popover"}
        aria-hidden={!open}
      >
        <div className="settings-popover-user">
          <strong>{user.email}</strong>
          <code>{user.id}</code>
        </div>
        <Link
          className="popover-action"
          onClick={() => onOpenChange(false)}
          state={settingsLinkState}
          to="/settings"
        >
          <UserRound size={15} />
          Profile
        </Link>
        <Link
          className="popover-action"
          onClick={() => onOpenChange(false)}
          state={settingsLinkState}
          to="/settings/usage"
        >
          <Gauge size={15} />
          Usage
        </Link>
        <Link
          className="popover-action"
          onClick={() => onOpenChange(false)}
          state={settingsLinkState}
          to="/settings/provider"
        >
          <Bot size={15} />
          Provider
        </Link>
        <Link
          className="popover-action"
          onClick={() => onOpenChange(false)}
          state={settingsLinkState}
          to="/settings/general"
        >
          <Settings size={15} />
          Settings
        </Link>
        <button className="popover-action" onClick={onLogout} type="button">
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </div>
  );
}
