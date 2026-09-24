import { RefObject, useEffect, useRef } from "react";

// Portaled dropdowns are position: fixed at the trigger's on-screen
// coordinates, so when the page scrolls they'd stay put while their trigger
// moves away. Close them on any scroll/resize instead — except scrolling
// inside the panel itself (e.g. a long option list).
export function useCloseOnScroll(open: boolean, onClose: () => void, panelRef?: RefObject<HTMLElement>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      if (panelRef?.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      onCloseRef.current();
    };
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, panelRef]);
}
