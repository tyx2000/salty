import type { RefObject } from "react";
import type { User } from "@supabase/supabase-js";
import { LogOut, Settings, SlidersHorizontal } from "lucide-react";

type SettingsPopoverProps = {
  menuRef: RefObject<HTMLDivElement | null>;
  onConfigureProviders: () => void;
  onLogout: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sidebarCollapsed: boolean;
  user: User;
};

export function SettingsPopover({
  menuRef,
  onConfigureProviders,
  onLogout,
  onOpenChange,
  open,
  sidebarCollapsed,
  user,
}: SettingsPopoverProps) {
  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        className="ghost-button full-width"
        onClick={() => onOpenChange(!open)}
        type="button"
        aria-label="Settings"
        aria-expanded={open}
      >
        <Settings size={16} />
        {!sidebarCollapsed ? "Settings" : null}
      </button>
      <div
        className={open ? "settings-popover open" : "settings-popover"}
        aria-hidden={!open}
      >
        <div className="settings-popover-user">
          <strong>{user.email}</strong>
          <code>{user.id}</code>
        </div>
        <button
          className="popover-action"
          onClick={onConfigureProviders}
          type="button"
        >
          <SlidersHorizontal size={15} />
          Configure providers
        </button>
        <button className="popover-action" onClick={onLogout} type="button">
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </div>
  );
}
