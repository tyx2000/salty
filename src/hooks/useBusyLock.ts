import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Provides a synchronous busy lock for chat turns plus React state for UI
 * disabling. The ref prevents rapid double-clicks before state updates commit.
 */
export function useBusyLock() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!busy) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [busy]);

  const acquireBusyLock = useCallback(() => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }, []);

  const releaseBusyLock = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  const clearBusyLock = useCallback(() => {
    busyRef.current = false;
  }, []);

  return {
    acquireBusyLock,
    busy,
    busyRef,
    clearBusyLock,
    releaseBusyLock,
  };
}
