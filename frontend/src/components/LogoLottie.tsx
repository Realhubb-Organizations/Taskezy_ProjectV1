"use client";

import React, { useState } from "react";

interface LogoLottieProps {
  className?: string;
}

export default function LogoLottie({ className = "" }: LogoLottieProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative inline-flex items-center select-none group cursor-pointer ${className}`}
    >
      {/* Background Ambient Glow Aura on Hover */}
      <div
        className={`absolute -inset-2.5 bg-gradient-to-r from-sky-400/20 via-brand-500/25 to-blue-600/20 rounded-2xl blur-lg transition-opacity duration-500 pointer-events-none ${
          isHovered ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Main Container with Infinite Nicraft Motion Sequence */}
      <div className="relative z-10 h-12 sm:h-14 md:h-16 flex items-center justify-start overflow-hidden">
        
        {/* Layer: Continuous Nicraft Animation Sequence */}
        <div className="relative h-full flex items-center animate-nicraft-continuous">
          <img
            src="/Blue White Professional Minimal Company Business Card.png"
            alt="TASKEZY Logo"
            className="h-full w-auto object-contain transition-transform duration-300 group-hover:scale-105 filter drop-shadow-xs"
          />

          {/* Continuous Light Sweep Shimmer Effect */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/50 to-transparent transform -skew-x-12 animate-nicraft-shimmer" />
          </div>
        </div>

      </div>

      <style>{`
        /* Continuous Infinite Nicraft Animation Sequence */
        @keyframes nicraftContinuous {
          0% {
            clip-path: inset(0 100% 0 0);
            transform: translateX(-20px) scale(0.96);
            opacity: 0;
          }
          15% {
            clip-path: inset(0 0 0 0);
            transform: translateX(0) scale(1);
            opacity: 1;
          }
          45% {
            transform: translateY(-2px) scale(1.02);
            opacity: 1;
          }
          60% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          85% {
            clip-path: inset(0 0 0 0);
            transform: translateX(0) scale(1);
            opacity: 1;
          }
          95% {
            clip-path: inset(0 100% 0 0);
            transform: translateX(10px) scale(0.98);
            opacity: 0;
          }
          100% {
            clip-path: inset(0 100% 0 0);
            transform: translateX(-20px) scale(0.96);
            opacity: 0;
          }
        }

        @keyframes nicraftShimmer {
          0% {
            transform: translateX(-140%) skewX(-20deg);
          }
          40%, 100% {
            transform: translateX(240%) skewX(-20deg);
          }
        }

        .animate-nicraft-continuous {
          animation: nicraftContinuous 4.5s cubic-bezier(0.16, 1, 0.3, 1) infinite;
        }

        .animate-nicraft-shimmer {
          animation: nicraftShimmer 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}
