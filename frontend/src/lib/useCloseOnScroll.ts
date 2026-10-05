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
    let lastWidth = window.innerWidth;
    const onScroll = (e: Event) => {
      if (panelRef?.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      onCloseRef.current();
    };
    // Phones resize the viewport height when the on-screen keyboard or address bar appears; only a width change (rotation) should close.
    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      onCloseRef.current();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, panelRef]);
}
