"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

const LOTTIE_SRC = "https://lottie.host/c4256467-50c5-404b-8fa8-e1117982bbd5/0wSFVkFJFS.json";

/** Hero centerpiece illustration — a soft glass backdrop keeps it visually anchored to the brand's existing card language rather than floating as a bare graphic. */
export default function HeroLottie() {
  return (
    <div className="relative w-full max-w-xl mx-auto mb-16">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-100/40 via-transparent to-brand-200/30 rounded-[2.5rem] blur-2xl scale-95 pointer-events-none" />
      <div className="glass-card rounded-[2rem] p-4 sm:p-6 relative">
        <DotLottieReact src={LOTTIE_SRC} loop autoplay className="w-full h-auto" />
      </div>
    </div>
  );
}
