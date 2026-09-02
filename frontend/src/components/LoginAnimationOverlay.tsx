"use client";

import React, { useEffect, useState } from "react";

interface LoginAnimationOverlayProps {
  onComplete: () => void;
  durationMs?: number;
}

export default function LoginAnimationOverlay({
  onComplete,
  durationMs = 2600
}: LoginAnimationOverlayProps) {
  const [step, setStep] = useState<"initial" | "zooming" | "fading">("initial");

  useEffect(() => {
    // Start smooth forward zoom immediately after mount
    const zoomTimer = setTimeout(() => {
      setStep("zooming");
    }, 100);

    // Start gradual fade out near peak zoom (1.8s mark)
    const fadeTimer = setTimeout(() => {
      setStep("fading");
    }, 1800);

    // Signal completion & reveal dashboard screens (2.6s)
    const completeTimer = setTimeout(() => {
      onComplete();
    }, durationMs);

    return () => {
      clearTimeout(zoomTimer);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [durationMs, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-white overflow-hidden transition-opacity duration-700 ease-out ${
        step === "fading" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Taskezy Brand Soft Radial Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(31,71,211,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Dead-Centered Zoom Assembly (Matching Netflix Intro 'rhnF-4ubr_g') */}
      <div
        className="relative flex items-center justify-center transition-all duration-[1900ms] cubic-bezier(0.16, 1, 0.3, 1) transform"
        style={{
          transformOrigin: "center center",
          transform:
            step === "initial"
              ? "scale(0.85)"
              : step === "zooming"
              ? "scale(3.2)"
              : "scale(3.8)",
          opacity: step === "initial" ? 0 : step === "zooming" ? 1 : 0
        }}
      >
        {/* Clean, 100% Uncropped Taskezy Logo (Zero clipping, full blue arrow visible, zero unwanted N artifacts) */}
        <div className="relative flex items-center justify-center p-2">
          <img
            src="/taskezy-logo-clean.png"
            alt="TASKEZY Logo"
            className="h-14 sm:h-16 w-auto max-w-none object-contain select-none pointer-events-none"
          />
        </div>
      </div>
    </div>
  );
}
