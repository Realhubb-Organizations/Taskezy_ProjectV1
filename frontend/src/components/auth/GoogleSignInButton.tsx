"use client";

import React, { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

// "Sign in with Google". Either way we end up with a Google-signed ID token
// ("credential") that the server verifies (POST /auth/google):
//  - Browser: Google Identity Services' own button + popup account picker.
//  - Android app: Google refuses sign-in inside an embedded WebView
//    ("disallowed_useragent"), so it uses Android's native account picker
//    (Credential Manager, via @capgo/capacitor-social-login). That token is
//    issued for the same Web client ID, so the server check is identical.
//
// Not shown when NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't set (feature off), or in
// an older app build that doesn't include the native plugin yet (v0.11 and
// earlier) — those keep using email + password.
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GSI_SRC = "https://accounts.google.com/gsi/client";
const ALLOWED_DOMAIN = "realhubb.in";

const isNativeApp = () => Capacitor.isNativePlatform();

export function isGoogleSignInAvailable(): boolean {
  if (!GOOGLE_CLIENT_ID) return false;
  return isNativeApp() ? Capacitor.isPluginAvailable("SocialLogin") : true;
}

let nativeInit: Promise<void> | null = null;
async function nativeGoogleSignIn(): Promise<string> {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  if (!nativeInit) {
    nativeInit = SocialLogin.initialize({ google: { webClientId: GOOGLE_CLIENT_ID, mode: "online", hostedDomain: ALLOWED_DOMAIN } })
      .catch(err => { nativeInit = null; throw err; });
  }
  await nativeInit;
  // No `scopes`: the defaults (openid, email, profile) already give us the
  // ID token with the email, and custom scopes would need a MainActivity change.
  const res = await SocialLogin.login({ provider: "google", options: {} });
  const idToken = (res.result as { idToken?: string | null }).idToken;
  if (!idToken) throw new Error("Google didn't return a sign-in token. Please try again.");
  return idToken;
}

const GoogleLogo = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

// Android app: same look as Google's own web button (white, outlined).
function NativeGoogleButton({ onCredential, onError, disabled }: { onCredential: (c: string) => void; onError: (m: string) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      onCredential(await nativeGoogleSignIn());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Closing the account picker isn't an error worth shouting about.
      if (!/cancel/i.test(msg)) onError("Google sign-in failed. Please try again.");
      console.warn("Native Google sign-in failed:", msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={signIn}
      disabled={busy || disabled}
      className="w-full min-h-11 flex items-center justify-center gap-2.5 rounded border border-[#dadce0] bg-white text-sm font-medium text-[#3c4043] hover:bg-[#f8faff] active:bg-[#eef3fd] transition-colors disabled:opacity-60"
    >
      <GoogleLogo />
      {busy ? "Signing in…" : "Sign in with Google"}
    </button>
  );
}

interface GsiId {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

let gsiScript: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiScript) {
    gsiScript = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { gsiScript = null; reject(new Error("Could not load Google sign-in.")); };
      document.head.appendChild(s);
    });
  }
  return gsiScript;
}

export default function GoogleSignInButton(props: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  if (!isGoogleSignInAvailable()) return null;
  return isNativeApp() ? <NativeGoogleButton {...props} /> : <WebGoogleButton {...props} />;
}

function WebGoogleButton({
  onCredential,
  onError,
  disabled
}: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // Latest handler without re-initialising Google on every render.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        const gsi = window.google?.accounts?.id;
        if (cancelled || !gsi || !btnRef.current || !wrapRef.current) return;
        gsi.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp: { credential?: string }) => {
            if (resp.credential) onCredentialRef.current(resp.credential);
            else onError("Google sign-in was cancelled.");
          },
          ux_mode: "popup",
          // Pre-filters Google's account picker to the company domain; the
          // server enforces it regardless.
          hd: ALLOWED_DOMAIN,
          auto_select: false,
          cancel_on_tap_outside: true
        });
        gsi.renderButton(btnRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "center",
          // GSI takes a fixed pixel width (max 400).
          width: Math.min(400, Math.max(200, Math.round(wrapRef.current.offsetWidth)))
        });
        setReady(true);
      })
      .catch(err => onError(err instanceof Error ? err.message : "Could not load Google sign-in."));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className={`w-full flex justify-center min-h-10 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      {!ready && <div className="w-full h-10 rounded-md border border-slate-200 bg-slate-50 animate-pulse" />}
      <div ref={btnRef} className={ready ? "" : "hidden"} />
    </div>
  );
}
