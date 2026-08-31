"use client";

import React, { useState } from "react";
import { TrendingUp, Scale } from "lucide-react";

interface LoginSlideVisualProps {
  variant: "dashboard" | "leads";
  /** Real exported slide image (see frontend/public/) — used when it loads; falls back to the drawn mockup below on 404. */
  imageSrc?: string;
}

/**
 * Prefers a real exported screenshot when one exists at imageSrc; falls back
 * to a code-drawn approximation (no external asset needed) if that file is
 * missing, so the carousel never shows a broken image while real slide
 * assets are still being sourced.
 */
export default function LoginSlideVisual({ variant, imageSrc }: LoginSlideVisualProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageSrc && !imageFailed) {
    return (
      <img
        src={imageSrc}
        alt=""
        className="w-full h-auto rounded-2xl shadow-2xl"
        onError={() => setImageFailed(true)}
      />
    );
  }

  if (variant === "leads") {
    return (
      <div className="relative w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">Leads</span>
            <div className="flex gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Total", value: "1,248" },
              { label: "Qualified", value: "486" },
              { label: "Converted", value: "152" }
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
                <p className="text-[9px] text-slate-400 font-bold uppercase">{s.label}</p>
                <p className="text-sm font-extrabold text-slate-800">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {[
              { name: "Aarav Mehta", status: "New", color: "bg-blue-100 text-blue-700" },
              { name: "Sneha Iyer", status: "Contacted", color: "bg-amber-100 text-amber-700" },
              { name: "Rahul Singh", status: "Qualified", color: "bg-violet-100 text-violet-700" },
              { name: "Vikram Desai", status: "Converted", color: "bg-emerald-100 text-emerald-700" }
            ].map((row) => (
              <div key={row.name} className="flex items-center justify-between bg-slate-50/70 rounded-lg px-2.5 py-1.5">
                <span className="text-[11px] font-semibold text-slate-600">{row.name}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${row.color}`}>{row.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Floating insight card */}
        <div className="absolute -top-6 -right-4 bg-white rounded-2xl shadow-2xl p-4 w-56 space-y-2">
          <p className="text-xs font-bold text-slate-800 leading-snug">
            Leads Analysis Report<br />
            <span className="font-normal text-slate-500">will increase the chance to take correct decision by</span>
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xl font-extrabold text-emerald-600">85%</span>
            <span className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
              <Scale className="h-4 w-4 text-emerald-600" />
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div className="bg-white rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">Dashboard</span>
          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
            <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Users", value: "335" },
            { label: "Signups", value: "650" },
            { label: "Revenue", value: "$6.2K" }
          ].map((s) => (
            <div key={s.label} className="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
              <p className="text-[9px] text-slate-400 font-bold uppercase">{s.label}</p>
              <p className="text-sm font-extrabold text-slate-800">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-1.5 h-16 px-1">
          {[40, 65, 50, 80, 55, 90, 70, 100, 60].map((h, i) => (
            <div key={i} className="flex-1 bg-brand-200 rounded-t" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      {/* Floating insight card */}
      <div className="absolute -top-6 -right-4 bg-white rounded-2xl shadow-2xl p-4 w-52 space-y-2">
        <p className="text-xs font-bold text-slate-800">Team performance<br />increased by</p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-extrabold text-emerald-600">65%</span>
          <span className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </span>
        </div>
      </div>
    </div>
  );
}
