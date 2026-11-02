import React from "react";

const COLORS: Record<"active" | "idle" | "offline", string> = {
  active: "bg-emerald-500",
  idle: "bg-amber-400",
  offline: "bg-rose-400"
};

const LABELS: Record<"active" | "idle" | "offline", string> = {
  active: "Active now",
  idle: "Idle",
  offline: "Offline"
};

export default function PresenceDot({ status, className = "", title }: { status: "active" | "idle" | "offline"; className?: string; title?: string }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${COLORS[status]} ${className}`} title={title ?? LABELS[status]} />;
}
