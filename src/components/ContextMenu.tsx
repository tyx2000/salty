import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

type ContextMenuProps = {
  /** Pixel coordinates for the menu's top-left corner. */
  x: number;
  y: number;
  /** Whether the menu is visible. */
  open: boolean;
  /** Called when the menu should close (outside click, scroll, resize, Escape). */
  onClose: () => void;
  /** Menu item buttons rendered inside the positioned menu surface. */
  children: ReactNode;
};

/** Padding from viewport edges when clamping position. */
const VIEWPORT_PADDING = 8;

/**
 * A right-click context menu positioned at (x, y) that:
 * - Clamps itself to stay within the viewport
 * - Dismisses on outside click, scroll, resize, and Escape
 * - Matches the model-menu visual style via the `.context-menu` CSS class
 */
export function ContextMenu({ x, y, open, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useClickOutside({
    open,
    ref: menuRef,
    onClose,
    dismissOnScroll: true,
    dismissOnResize: true,
  });

  useLayoutEffect(() => {
    if (!open || !menuRef.current) {
      setPos(null);
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    let clampedX = x;
    let clampedY = y;

    if (clampedX + rect.width > window.innerWidth - VIEWPORT_PADDING) {
      clampedX = window.innerWidth - rect.width - VIEWPORT_PADDING;
    }
    if (clampedY + rect.height > window.innerHeight - VIEWPORT_PADDING) {
      clampedY = window.innerHeight - rect.height - VIEWPORT_PADDING;
    }
    if (clampedX < VIEWPORT_PADDING) clampedX = VIEWPORT_PADDING;
    if (clampedY < VIEWPORT_PADDING) clampedY = VIEWPORT_PADDING;

    setPos({ x: clampedX, y: clampedY });
  }, [open, x, y]);

  if (!open) return null;

  return (
    <div
      className="context-menu open"
      ref={menuRef}
      role="menu"
      style={{
        left: pos ? pos.x : x,
        top: pos ? pos.y : y,
        position: "fixed",
      }}
    >
      {children}
    </div>
  );
}
