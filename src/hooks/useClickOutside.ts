import { useEffect, type RefObject } from "react";

type UseClickOutsideOptions = {
  /** Whether the overlay is currently open. When false, no listeners are registered. */
  open: boolean;
  /** Ref to the overlay element — clicks inside it are ignored. */
  ref: RefObject<HTMLElement | null>;
  /** Called when a click outside (or scroll) is detected. */
  onClose: () => void;
  /** Also dismiss on scroll events (capture phase). Default false. */
  dismissOnScroll?: boolean;
  /** Also dismiss on window resize events. Default false. */
  dismissOnResize?: boolean;
};

/**
 * Dismisses an overlay when the user clicks outside it (pointerdown on document).
 * Optionally also dismisses on scroll and/or resize.
 *
 * Replaces the repeated useEffect blocks for settings popover, mobile
 * conversations, model menu, reasoning menu, and context menu.
 */
export function useClickOutside({
  open,
  ref,
  onClose,
  dismissOnScroll = false,
  dismissOnResize = false,
}: UseClickOutsideOptions) {
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target)) return;
      onClose();
    }

    function handleScroll() {
      onClose();
    }

    function handleResize() {
      onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    if (dismissOnScroll) {
      window.addEventListener("scroll", handleScroll, true);
    }
    if (dismissOnResize) {
      window.addEventListener("resize", handleResize);
    }

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      if (dismissOnScroll) {
        window.removeEventListener("scroll", handleScroll, true);
      }
      if (dismissOnResize) {
        window.removeEventListener("resize", handleResize);
      }
    };
  }, [open, ref, onClose, dismissOnScroll, dismissOnResize]);
}
