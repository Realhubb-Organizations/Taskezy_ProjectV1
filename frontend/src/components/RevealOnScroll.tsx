"use client";

import React, { useEffect, useRef, useState } from "react";

interface RevealOnScrollProps {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}

/** Fades + slides a section in the moment it enters the viewport — pairs with .reveal-on-scroll in globals.css. */
export default function RevealOnScroll({ children, delayMs = 0, className = "" }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal-on-scroll ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
