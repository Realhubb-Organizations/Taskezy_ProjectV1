import React, { useState, useEffect, useRef } from "react";
import { MoreVertical, ExternalLink } from "lucide-react";
import Link from "next/link";

export interface ActionItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface SubActionsMenuProps {
  actions: ActionItem[];
}

export default function SubActionsMenu({ actions }: SubActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-405 hover:text-slate-700 transition-colors"
        title="Quick actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-fade-in">
          {actions.map((act, idx) => {
            const content = (
              <span className="flex items-center justify-between text-left w-full px-2.5 py-2 text-[10px] font-bold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition-colors">
                {act.label}
                <ExternalLink className="h-3 w-3 text-slate-400 shrink-0" />
              </span>
            );

            if (act.href) {
              return (
                <Link key={idx} href={act.href} onClick={() => setIsOpen(false)} className="block">
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={idx}
                type="button"
                className="w-full text-left block"
                onClick={() => {
                  if (act.onClick) act.onClick();
                  setIsOpen(false);
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
