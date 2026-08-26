"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

const LOTTIE_SRC = "https://lottie.host/c4256467-50c5-404b-8fa8-e1117982bbd5/0wSFVkFJFS.json";

/** Foreground showcase visual, framed in the app's existing glass-card language — sits between the hero and feature cards. */
export default function ProductShowcaseLottie() {
  return (
    <div className="relative w-full max-w-xl mx-auto">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-100/40 via-transparent to-brand-200/30 rounded-[2.5rem] blur-2xl scale-95 pointer-events-none" />
      <div className="glass-card rounded-[2rem] p-4 sm:p-6 relative">
        <DotLottieReact src={LOTTIE_SRC} loop autoplay className="w-full h-auto" />
      </div>
    </div>
  );
}
