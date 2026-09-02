"use client";

import React, { useState } from "react";

interface TaskezyNicraftLogoProps {
  className?: string;
  height?: number;
}

export default function TaskezyNicraftLogo({
  className = "",
  height = 54,
}: TaskezyNicraftLogoProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`relative inline-flex items-center select-none group cursor-pointer ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ height: `${height}px` }}
    >
      {/* Background Soft Glow on Hover */}
      <div
        className={`absolute -inset-2 bg-gradient-to-r from-sky-500/15 via-blue-600/20 to-sky-400/15 rounded-xl blur-lg transition-opacity duration-500 pointer-events-none ${
          isHovered ? "opacity-100" : "opacity-0"
        }`}
      />

      <svg
        viewBox="0 0 340 85"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto overflow-visible drop-shadow-xs"
      >
        <defs>
          {/* Blue Arrow Gradient */}
          <linearGradient
            id="nicraftArrowGrad"
            x1="0%"
            y1="100%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#0077B6" />
            <stop offset="60%" stopColor="#0096C7" />
            <stop offset="100%" stopColor="#00B4D8" />
          </linearGradient>
        </defs>

        <style>{`
          @keyframes arrowDraw {
            0% {
              stroke-dashoffset: 140;
              opacity: 0;
            }
            30% {
              opacity: 1;
            }
            100% {
              stroke-dashoffset: 0;
              opacity: 1;
            }
          }

          @keyframes headPop {
            0%, 40% {
              transform: scale(0) translate(0, 10px);
              opacity: 0;
            }
            70% {
              transform: scale(1.2) translate(0, -2px);
              opacity: 1;
            }
            100% {
              transform: scale(1) translate(0, 0);
              opacity: 1;
            }
          }

          @keyframes textReveal {
            0% {
              transform: translateX(-18px);
              opacity: 0;
            }
            100% {
              transform: translateX(0);
              opacity: 1;
            }
          }

          @keyframes boxCheck {
            0% {
              transform: scale(0);
              opacity: 0;
            }
            60% {
              transform: scale(1.2);
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }

          .animate-arrow-path {
            stroke-dasharray: 140;
            stroke-dashoffset: 140;
            animation: arrowDraw 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }

          .animate-arrow-head {
            transform-origin: 310px 24px;
            animation: headPop 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          }

          .animate-text-group {
            animation: textReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
          }

          .animate-box-1 {
            transform-origin: 194px 34px;
            animation: boxCheck 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s both;
          }
          .animate-box-2 {
            transform-origin: 194px 45px;
            animation: boxCheck 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.65s both;
          }
          .animate-box-3 {
            transform-origin: 194px 56px;
            animation: boxCheck 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s both;
          }

          .hover-arrow-float {
            transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .group:hover .hover-arrow-float {
            transform: translateY(-4px) scale(1.04);
          }
        `}</style>

        {/* --- MAIN LOGO GROUP --- */}
        <g className="animate-text-group">
          {/* TASK Text */}
          <path
            d="M10 26H36V34H28V64H18V34H10V26Z"
            fill="#0A1C33"
          />
          <path
            d="M39 64L52 26H63L76 64H65L62.5 56H51.5L49 64H39ZM54 48H60L57 37L54 48Z"
            fill="#0A1C33"
          />
          <path
            d="M79 57.5L84 51C89 54.5 94 57 99.5 57C104 57 106.5 55 106.5 52.5C106.5 50 103.5 48.5 96.5 46.5C87.5 44 82 40.5 82 33C82 28.5 86.5 25 95.5 25C101.5 25 107 26.5 111.5 30L107 36.5C103 33.5 98.5 32 95 32C91 32 89 33.5 89 35.5C89 37.5 92 39 98.5 41C107.5 43.5 113 47 113 54C113 59.5 107.5 64.5 98 64.5C90.5 64.5 84 62 79 57.5Z"
            fill="#0A1C33"
          />
          <path
            d="M116 26H125V41.5L137 26H149L135 42.5L150 64H138L125 45.5V64H116V26Z"
            fill="#0A1C33"
          />

          {/* EZY Text */}
          {/* E (Vertical stem & horizontal bars) */}
          <path
            d="M165 26H196V33H174V40.5H192V47.5H174V55.5H196V64H165V26Z"
            fill="#0A1C33"
          />

          {/* Checkboxes stacked inside E */}
          <rect
            x="180"
            y="30"
            width="7"
            height="7"
            rx="1.5"
            stroke="#0A1C33"
            strokeWidth="1.8"
            fill="none"
            className="animate-box-1"
          />
          <rect
            x="180"
            y="41.5"
            width="7"
            height="7"
            rx="1.5"
            stroke="#0A1C33"
            strokeWidth="1.8"
            fill="none"
            className="animate-box-2"
          />
          <rect
            x="180"
            y="53"
            width="7"
            height="7"
            rx="1.5"
            stroke="#0A1C33"
            strokeWidth="1.8"
            fill="none"
            className="animate-box-3"
          />

          {/* Z */}
          <path
            d="M201 26H229V33L212 56.5H230V64H200V57L217 33.5H201V26Z"
            fill="#0A1C33"
          />

          {/* Y (Left arm + bottom stem) */}
          <path
            d="M233 26H243L251 41.5V64H242V41.5L233 26Z"
            fill="#0A1C33"
          />
        </g>

        {/* --- DYNAMIC NICRAFT ANIMATED BLUE ARROW (Right arm of Y & shooting upward) --- */}
        <g className="hover-arrow-float">
          {/* Arrow Curved Stem Path */}
          <path
            d="M251 64 C251 46, 258 35, 298 24"
            stroke="url(#nicraftArrowGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            className="animate-arrow-path"
          />

          {/* Arrowhead Arrow Tip */}
          <path
            d="M284 14 L308 20 L296 40 L290 30 Z"
            fill="url(#nicraftArrowGrad)"
            className="animate-arrow-head"
          />
        </g>
      </svg>
    </div>
  );
}
