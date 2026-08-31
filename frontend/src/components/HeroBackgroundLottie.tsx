"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

const LOTTIE_SRC = "https://lottie.host/e3b804a4-cfca-40e0-a996-77e592036c64/6IjFXNu5hE.json";

/**
 * Sits behind the hero text (badge/heading/copy/buttons), not as a
 * foreground element — oversized, low-opacity, and non-interactive so it
 * reads as ambient motion rather than competing with the text for
 * attention or intercepting clicks on the CTAs above it.
 */
export default function HeroBackgroundLottie() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
      <div className="w-[140%] max-w-4xl opacity-25 mix-blend-multiply">
        <DotLottieReact src={LOTTIE_SRC} loop autoplay className="w-full h-auto" />
      </div>
    </div>
  );
}
