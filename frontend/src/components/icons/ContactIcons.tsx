import React from "react";

// The real file at public/whatsapp.png (the user-supplied reference icon,
// 2026-10-10) — same static-image convention as ExcelIcon below, replacing
// the earlier hand-built SVG glyph.
export function WhatsAppIcon({ className }: { className?: string }) {
  return <img src="/whatsapp.png" alt="WhatsApp" className={className} />;
}

// A solid (filled) phone-receiver glyph — lucide's own "Phone" icon is
// stroke-only, which doesn't match the reference's solid black icon.
export function CallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64 0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6l-40.4 49.3C234.3 334.7 177.3 277.7 144 207.3L184.6 167c11.1-13.7 15.8-32.6 11.6-46.3l-40-96z" />
    </svg>
  );
}

// Same Meta/Google brand icons already used for the CRM Campaigns dropdown's
// group headers — pulled out here so every place that shows a lead's ad
// source/platform (Source column, Campaign column fallback, quick-view
// drawer, Add Lead's source picker) can share one icon + one classification
// rule instead of each re-implementing it slightly differently.
export function MetaIcon({ className }: { className?: string }) {
  return <img src="https://img.icons8.com/?size=100&id=wA5rN96FVDtq&format=png&color=000000" alt="Meta" className={className} />;
}

export function GoogleIcon({ className }: { className?: string }) {
  return <img src="https://img.icons8.com/?size=100&id=4hR4Ih04Je2t&format=png&color=000000" alt="Google" className={className} />;
}

// Data Calling's bulk-uploaded leads (source "Bulk Upload"/"Data" — see
// leads.service.ts's promotion rule) are sourced from an admin-uploaded
// Excel file, so they get this glyph the same way Meta/Google leads get
// their platform logo — the real file at public/database.png, not the
// earlier hand-built SVG placeholder.
export function ExcelIcon({ className }: { className?: string }) {
  return <img src="/database.png" alt="Data" className={className} />;
}

// Classifies a lead's source/campaign text into which ad platform icon to
// show — null means "no icon, just show the text" (Referral Code, Offline
// Event, a custom-added source, etc.). "Data" is Data Calling's promoted
// (Connected+Qualified) leads and "Bulk Upload" is one still sitting in
// Data Calling itself — both are the same Excel-uploaded origin, just
// before/after promotion, so both get the same icon.
export function platformFromText(text: string | undefined | null): "Meta" | "Google" | "Excel" | null {
  if (!text) return null;
  if (/meta|facebook|instagram/i.test(text)) return "Meta";
  if (/google/i.test(text)) return "Google";
  if (/^(data|bulk upload)$/i.test(text.trim())) return "Excel";
  return null;
}

// Icon + text for any cell/field showing a lead's source or campaign — the
// visible label (text) and what decides the icon (classifyBy) are separate
// because a Campaign cell shows the campaign name but should classify off
// the lead's more reliable source field when one exists. With iconOnly, a
// recognized platform renders as just the icon (the text moves to a title
// tooltip instead) — values with no icon match still fall back to text,
// since there's nothing to show otherwise.
export function PlatformLabel({
  text,
  classifyBy,
  className,
  iconOnly = false,
  wrap = false
}: {
  text: string;
  classifyBy?: string;
  className?: string;
  iconOnly?: boolean;
  /** Wrap long text onto more lines inside its container instead of cutting it off. */
  wrap?: boolean;
}) {
  const platform = platformFromText(classifyBy ?? text);
  if (iconOnly && platform) {
    return (
      <span className={`inline-flex items-center ${className || ""}`} title={text}>
        {platform === "Meta" && <MetaIcon className="h-4 w-4 shrink-0" />}
        {platform === "Google" && <GoogleIcon className="h-4 w-4 shrink-0" />}
        {platform === "Excel" && <ExcelIcon className="h-4 w-4 shrink-0" />}
      </span>
    );
  }
  if (wrap) {
    return (
      <span className={`flex items-start gap-1.5 min-w-0 max-w-full ${className || ""}`}>
        {platform === "Meta" && <MetaIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        {platform === "Google" && <GoogleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        {platform === "Excel" && <ExcelIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className || ""}`}>
      {platform === "Meta" && <MetaIcon className="h-3.5 w-3.5 shrink-0" />}
      {platform === "Google" && <GoogleIcon className="h-3.5 w-3.5 shrink-0" />}
      {platform === "Excel" && <ExcelIcon className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{text}</span>
    </span>
  );
}
