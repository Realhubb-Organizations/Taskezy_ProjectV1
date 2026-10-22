"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ShieldCheck, AlertCircle, Eye, EyeOff, Sparkles } from "lucide-react";
import Link from "next/link";
import LoginAnimationOverlay from "@/components/LoginAnimationOverlay";
import GoogleSignInButton, { isGoogleSignInAvailable } from "@/components/auth/GoogleSignInButton";

const slides = [
  {
    image: "/signin.png",
    title: "Managing Team just got easier",
    description: "Simplify team management and drive better results with unprecedented real-time visibility across your entire portfolio."
  },
  {
    image: "/crm_signin.png",
    title: "Sales & Client Pipeline Simplified",
    description: "Manage leads, track deals progress, and grow relationships with our advanced CRM module."
  },
  {
    image: "/hrms_signin.png",
    title: "Empower Your HR & Operations",
    description: "Track attendance, manage team leaves, and streamline employee satisfaction in one place."
  }
];

export default function LoginPage() {
  const router = useRouter();
  const { loginWithTempPassword, verifyLoginOtp, resendLoginOtp, loginWithGoogle, currentUser, changeOwnPassword, logout } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Force Password Reset Flow state
  const [isResetRequired, setIsResetRequired] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");

  // Email OTP step: shown after a correct password on a device that isn't
  // trusted yet (the server emailed a 6-digit code).
  const [otpChallenge, setOtpChallenge] = useState<{ challengeId: string; maskedEmail: string } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [otpError, setOtpError] = useState("");
  const [otpNotice, setOtpNotice] = useState("");
  const [resendWait, setResendWait] = useState(0);

  useEffect(() => {
    if (resendWait <= 0) return;
    const t = setTimeout(() => setResendWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [resendWait]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShowingSplash, setIsShowingSplash] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // A still-valid session (restored from the refresh-token cookie on app
  // launch — see AppContext.tsx's mount effect) means there's nothing to
  // log in for; without this, a user who never actually got signed out
  // still lands on and has to look at the login form every time they open
  // the app, even though they're already authenticated underneath it.
  // isResetRequired only ever becomes true mid-login-attempt on this same
  // page, never from a restored session, but it's checked anyway so a
  // forced password reset in progress is never interrupted.
  //
  // Goes to the last real route the (app) layout recorded (see its own
  // lastRoute effect) rather than always /home — the native app's process
  // gets killed under memory pressure far more often than a typical app
  // (confirmed on-device, 2026-10-10), and every cold restart reloads this
  // exact login page first (it's the Capacitor server.url), so without
  // this a user who was on the Leads page would land back on Home every
  // single time the OS reclaimed the app in the background.
  useEffect(() => {
    if (!currentUser || isResetRequired) return;
    // Temporary password but no reset form showing (it only appears right
    // after typing the password here): never forward into the app — sign
    // out so they log in again and get the reset form.
    if (currentUser.passwordStatus === "TEMPORARY") {
      logout();
      return;
    }
    let dest = "/home";
    try {
      const saved = window.localStorage.getItem("lastRoute");
      if (saved && saved.startsWith("/") && !saved.startsWith("/auth")) dest = saved;
    } catch {
      // Private browsing / storage disabled — falls back to /home, same as before this existed.
    }
    router.replace(dest);
  }, [currentUser, isResetRequired, router, logout]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setIsSubmitting(true);
    const result = await loginWithTempPassword(email, password).finally(() => setIsSubmitting(false));
    if (!result.user && result.otp) {
      setOtpChallenge(result.otp);
      setOtpCode("");
      setOtpError("");
      setOtpNotice("");
      setResendWait(30);
      return;
    }
    if (!result.user) {
      const messages: Record<typeof result.errorType, string> = {
        network: "We couldn't reach the server. Please check your connection and try again in a moment.",
        rate_limited: "Too many login attempts. Please wait a few minutes before trying again.",
        invalid_credentials: "Invalid email address or password. Please check your credentials."
      };
      setError(messages[result.errorType]);
      return;
    }
    afterPasswordLogin(result.user);
  };

  const afterPasswordLogin = (user: { passwordStatus: string }) => {
    if (user.passwordStatus === "TEMPORARY") {
      setIsResetRequired(true);
    } else {
      router.push("/home");
    }
  };

  // Keeps only digits, so a paste like "Code: 123 456" still works.
  const cleanCode = (raw: string) => raw.replace(/\D/g, "").slice(0, 6);

  const submitOtp = async (code: string) => {
    if (!otpChallenge || isSubmitting) return;
    if (code.length !== 6) {
      setOtpError("Enter the 6-digit code from the email.");
      return;
    }
    setOtpError("");
    setOtpNotice("");
    setIsSubmitting(true);
    const result = await verifyLoginOtp(otpChallenge.challengeId, code, trustDevice).finally(() => setIsSubmitting(false));
    if (!result.user) {
      setOtpError(result.error);
      setOtpCode("");
      return;
    }
    setOtpChallenge(null);
    afterPasswordLogin(result.user);
  };

  const handleOtpChange = (raw: string) => {
    const code = cleanCode(raw);
    setOtpCode(code);
    if (code.length === 6) submitOtp(code);
  };

  // Reading the clipboard can be refused (browser permission, older
  // WebViews) — then long-press / Ctrl+V in the box still works.
  const pasteOtp = async () => {
    try {
      const code = cleanCode(await navigator.clipboard.readText());
      if (code.length !== 6) {
        setOtpError("No 6-digit code found on the clipboard. Copy the code from the email first.");
        return;
      }
      handleOtpChange(code);
    } catch {
      setOtpError("Couldn't read the clipboard. Long-press (or Ctrl+V) in the box to paste the code.");
    }
  };

  const handleResendOtp = async () => {
    if (!otpChallenge || resendWait > 0) return;
    setOtpError("");
    setOtpNotice("");
    const result = await resendLoginOtp(otpChallenge.challengeId);
    if (result.error) {
      setOtpError(result.error);
      return;
    }
    setOtpCode("");
    setOtpNotice(`A new code was sent to ${otpChallenge.maskedEmail}.`);
    setResendWait(30);
  };

  const leaveOtp = () => {
    setOtpChallenge(null);
    setOtpCode("");
    setOtpError("");
    setOtpNotice("");
    setPassword("");
  };

  // Decided after mount: isGoogleSignInAvailable() checks for the native
  // app, which the server-rendered pass can't know.
  const [googleAvailable, setGoogleAvailable] = useState(false);
  useEffect(() => { setGoogleAvailable(isGoogleSignInAvailable()); }, []);

  // Google already proved who they are, so there's no temporary-password
  // reset step here (the server returns must_reset_password = false).
  const handleGoogleCredential = async (credential: string) => {
    setError("");
    setIsSubmitting(true);
    const result = await loginWithGoogle(credential).finally(() => setIsSubmitting(false));
    if (!result.user) {
      setError(result.error);
      return;
    }
    router.push("/home");
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");

    if (newPassword.length < 8) {
      setResetError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const result = await changeOwnPassword(password, newPassword);
    setIsSubmitting(false);
    if (!result.success) {
      setResetError(result.error || "Could not update your password. Please try again.");
      return;
    }
    router.push("/home");
  };

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:flex-row bg-white text-slate-800 lg:overflow-hidden">

      {/* Left Panel: Carousel Slider */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] h-full p-10 xl:p-14 bg-gradient-to-br from-[#779bf6] via-[#1f47d3] to-[#0b1d6e] text-white relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.08),transparent)] pointer-events-none" />

        {/* Top Section: Logo */}
        {/* The source PNG has large built-in blank padding (~28% top, ~8% left) around the
            actual wordmark, so a plain height class positions the invisible canvas, not the
            visible logo. This crops the padding out so the wordmark itself sits at top-6/left-12. */}
        <div className="absolute top-6 left-12 z-20 overflow-hidden" style={{ width: 156, height: 40 }}>
          <img
            src="/Blue White Professional Minimal Company Business Card.png"
            alt="TASKEZY Logo"
            className="max-w-none"
            style={{ width: 186, height: 106, marginTop: -30, marginLeft: -15 }}
          />
        </div>

        {/* Middle Section: Mockup & Text */}
        <div className="flex-1 flex flex-col items-center justify-center w-full z-10 my-4">
          <div className="relative w-full max-w-[420px] xl:max-w-[460px] aspect-[1.5] mb-6">
            {slides.map((slide, index) => (
              <img
                key={index}
                src={slide.image}
                alt={slide.title}
                className={`absolute inset-0 w-full h-full object-contain transition-all duration-700 transform ${
                  index === currentSlide
                    ? "opacity-100 scale-100 z-10"
                    : "opacity-0 scale-95 z-0 pointer-events-none"
                }`}
              />
            ))}
          </div>

          <div className="text-center space-y-2 max-w-md px-4">
            <h2 className="text-xl xl:text-2xl font-bold tracking-tight">
              {slides[currentSlide].title}
            </h2>
            <p className="text-[11px] xl:text-xs text-blue-100/85 leading-relaxed font-light">
              {slides[currentSlide].description}
            </p>
          </div>

          {/* Dots Indicator */}
          <div className="flex justify-center gap-2 mt-6">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === currentSlide ? "bg-[#f59e0b] scale-110" : "bg-white/60 hover:bg-white"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Bottom Section: Footer Links */}
        <div className="z-10 flex items-center justify-center gap-6 text-xs xl:text-sm text-white/90">
          <Link href="/privacy-policy" className="hover:underline flex items-center gap-1.5 font-medium">
            <span className="text-[8px]">•</span> Privacy Policy
          </Link>
          <span className="text-white/30">|</span>
          <Link href="/terms" className="hover:underline flex items-center gap-1.5 font-medium">
            <span className="text-[8px]">•</span> Terms
          </Link>
        </div>
      </div>

      {/* Right Panel: Sign-In Container — natural height on mobile so the page
          just scrolls normally; locked to the split-screen's full height (with
          its own scroll if content is ever taller than a short viewport) on
          desktop only, matching the fixed-height carousel beside it. */}
      <div className="flex-1 lg:h-full flex flex-col justify-center items-center p-6 sm:p-10 lg:p-14 bg-white lg:overflow-y-auto">
        <div className="w-full max-w-[440px]">

          {/* Logo visible only on mobile/tablet — same crop-out-the-padding fix as the desktop logo above */}
          <div className="lg:hidden text-center mb-6">
            <div className="overflow-hidden mx-auto" style={{ width: 156, height: 40 }}>
              <img
                src="/Blue White Professional Minimal Company Business Card.png"
                alt="TASKEZY Logo"
                className="max-w-none"
                style={{ width: 186, height: 106, marginTop: -30, marginLeft: -15 }}
              />
            </div>
          </div>

          {!isResetRequired && otpChallenge ? (
            /* Email OTP — second step of password login */
            <div className="border border-gray-300 rounded-lg p-8 sm:p-12 bg-white shadow-sm space-y-7">
              <div>
                <h1 className="text-xl xl:text-2xl font-bold text-gray-900 tracking-tight">Enter verification code</h1>
                <p className="text-xs xl:text-sm text-gray-500 mt-1 font-light">
                  We sent a 6-digit code to {otpChallenge.maskedEmail}
                </p>
              </div>

              {otpError && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}
              {otpNotice && !otpError && <p className="text-xs text-gray-500">{otpNotice}</p>}

              <form onSubmit={(e) => { e.preventDefault(); submitOtp(otpCode); }} className="space-y-5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="otp-code" className="block text-xs font-semibold text-gray-700">
                      Code <span className="text-red-500">*</span>
                    </label>
                    <button type="button" onClick={pasteOtp} disabled={isSubmitting} className="py-2.5 sm:py-0 text-xs text-blue-500 hover:underline font-normal">
                      Paste
                    </button>
                  </div>
                  <input
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={otpCode}
                    onChange={(e) => handleOtpChange(e.target.value)}
                    placeholder="6-digit code"
                    maxLength={12}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-md text-base sm:text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={trustDevice}
                    onChange={(e) => setTrustDevice(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  Trust this device for 30 days
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-11 sm:min-h-0 bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-60 text-white font-medium py-2.5 rounded-md text-sm transition-colors mt-8 shadow-sm"
                >
                  {isSubmitting ? "Verifying..." : "Continue"}
                </button>

                <div className="flex items-center justify-between text-xs">
                  <button type="button" onClick={leaveOtp} className="py-2.5 sm:py-0 text-blue-500 hover:underline font-normal">
                    Back to sign in
                  </button>
                  {resendWait > 0 ? (
                    <span className="py-2.5 sm:py-0 text-gray-400">Resend code in {resendWait}s</span>
                  ) : (
                    <button type="button" onClick={handleResendOtp} className="py-2.5 sm:py-0 text-blue-500 hover:underline font-normal">
                      Resend code
                    </button>
                  )}
                </div>
              </form>
            </div>
          ) : !isResetRequired ? (
            /* Login Form Container with precise border box */
            <div className="border border-gray-300 rounded-lg p-8 sm:p-12 bg-white shadow-sm space-y-7">

              <div>
                <h1 className="text-xl xl:text-2xl font-bold text-gray-900 tracking-tight">Sign in to your account</h1>
                <p className="text-xs xl:text-sm text-gray-500 mt-1 font-light">
                  Don&apos;t have an account?{" "}
                  <Link href="/checkout" className="inline-flex items-center py-2.5 sm:py-0 text-blue-500 hover:underline font-normal font-sans">
                    Sign Up
                  </Link>
                </p>
              </div>

              {error && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Sign in with Google — hidden until configured, and inside
                  the Android app (see GoogleSignInButton). */}
              {googleAvailable && (
                <>
                  <GoogleSignInButton onCredential={handleGoogleCredential} onError={setError} disabled={isSubmitting} />

                  {/* Divider */}
                  <div className="relative flex items-center">
                    <div className="flex-grow border-t border-gray-200"></div>
                    <span className="flex-shrink mx-4 text-xs text-gray-400 font-light">Or Use Email</span>
                    <div className="flex-grow border-t border-gray-200"></div>
                  </div>
                </>
              )}

              {/* Sign In Form */}
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="abc@example.com"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-md text-base sm:text-xsplaceholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-l-md text-base sm:text-xsplaceholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="h-11 w-11 sm:h-auto sm:w-auto sm:px-3.5 sm:py-3.5 flex items-center justify-center bg-gray-100 border-y border-r border-gray-300 rounded-r-md text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="text-left">
                  <Link href="#" className="inline-flex items-center py-2.5 sm:py-0 text-xs text-blue-500 hover:underline font-normal">
                    Forgot Password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-11 sm:min-h-0 bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-60 text-white font-medium py-2.5 rounded-md text-sm transition-colors mt-8 shadow-sm"
                >
                  {isSubmitting ? "Signing in..." : "Continue"}
                </button>

                <div className="text-center mt-4">
                  <p className="text-[11px] sm:text-xs text-gray-500 font-light">
                    Need to create a new tenant?{" "}
                    <Link href="/checkout" className="inline-flex items-center py-2.5 sm:py-0 text-blue-500 hover:underline font-normal">
                      Configure a subscription plan
                    </Link>
                  </p>
                </div>
              </form>

            </div>
          ) : (
            /* Enforced Reset Form */
            <div className="border border-gray-300 rounded-lg p-8 sm:p-10 bg-white shadow-sm space-y-6">
              <div className="flex gap-2.5 items-center p-3 rounded-xl bg-blue-50 border border-blue-100">
                <Sparkles className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-blue-800">First-time Login Detected</h4>
                  <p className="text-[10px] text-blue-600">
                    Password reset is strictly enforced for new accounts.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900">Configure Active Password</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Establish a secure password for user <span className="text-blue-600 font-bold">{currentUser?.email}</span>.
                </p>
              </div>

              {resetError && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-md text-base sm:text-xsplaceholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-md text-base sm:text-xsplaceholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-60 text-white font-semibold py-2.5 rounded-md text-sm transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {isSubmitting ? "Saving..." : "Secure and Login"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
