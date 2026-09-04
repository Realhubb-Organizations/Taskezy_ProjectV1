import React from "react";

// lucide-react has no WhatsApp brand glyph (it's a generic icon set, not a
// brand-icon set) — this is the standard WhatsApp glyph, filled white on a
// solid black circle, matching the requested reference exactly.
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      <path
        fill="#fff"
        d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.7.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.34z"
      />
      <path
        fill="#fff"
        d="M12.05 3c-4.94 0-8.94 4-8.94 8.93 0 1.57.41 3.11 1.19 4.46L3 21l4.72-1.24a8.94 8.94 0 004.33 1.1h0c4.94 0 8.94-4 8.94-8.93A8.9 8.9 0 0012.05 3zm5.24 14.16A7.34 7.34 0 0112.06 19a7.4 7.4 0 01-3.77-1.03l-.27-.16-2.81.74.75-2.74-.18-.28a7.35 7.35 0 01-1.13-3.93 7.4 7.4 0 017.4-7.4 7.35 7.35 0 015.24 2.17 7.34 7.34 0 012.17 5.23c0 1.97-.77 3.82-2.17 5.24z"
      />
    </svg>
  );
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
