"use client";

import React from "react";

/**
 * High-end ambient atmospheric lighting backdrop.
 * Replaces intrusive wireframe lotties with smooth, luxury radial light beams
 * and soft ambient glow that never obscures text legibility.
 */
export default function HeroBackgroundLottie() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
      {/* Soft Ambient Radial Light Orb */}
      <div className="w-[50rem] h-[30rem] bg-gradient-to-tr from-brand-500/10 via-blue-500/8 to-indigo-500/5 rounded-full blur-[120px] animate-blob-float" />
      
      {/* Delicate Luxury Grid Background */}
      <div 
        className="absolute inset-0 opacity-[0.035]" 
        style={{
          backgroundImage: `radial-gradient(#0a1c33 1px, transparent 1px)`,
          backgroundSize: `32px 32px`,
        }} 
      />
    </div>
  );
}
