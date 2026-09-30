"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";

// The marketing landing page (app/page.tsx) makes sense for a browser visitor
// on taskezy.in, but not inside the wrapped Android/iOS app — there, "/"
// should go straight to the login screen. Capacitor.isNativePlatform() is a
// safe, synchronous check that's always false in a plain browser (this same
// static bundle is what taskezy.in itself serves), so this only ever
// redirects inside the native shell.
//
// Deliberately renders `children` unconditionally rather than gating on
// state: since this is a fully static export, the pre-rendered HTML is
// generated once at build time (in Node, with no `window`), so any state
// that defaults to "unknown, render nothing yet" would bake an EMPTY page
// into that static HTML — breaking it for every web visitor, not just
// showing a brief flash. Rendering children immediately keeps the static
// export identical to before this component existed; only the native path
// gets an extra effect that fires a redirect. That leaves a brief flash of
// the marketing content on native before the redirect completes — removing
// that fully needs a real splash screen (@capacitor/splash-screen, a later
// step) that stays up until the web view signals it's ready.
export default function HomeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      router.replace("/auth/login");
    }
  }, [router]);

  return <>{children}</>;
}
