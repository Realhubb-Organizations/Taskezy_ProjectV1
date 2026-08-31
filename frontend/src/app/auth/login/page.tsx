"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ShieldCheck, AlertCircle, Eye, EyeOff, Sparkles } from "lucide-react";
import Link from "next/link";

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
  const { loginWithTempPassword, currentUser, setCurrentUserPasswordActive } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Force Password Reset Flow state
  const [isResetRequired, setIsResetRequired] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setIsSubmitting(true);
    const user = await loginWithTempPassword(email, password).finally(() => setIsSubmitting(false));
    if (!user) {
      setError("Invalid email address or password. Please check your credentials.");
      return;
    }

    if (user.passwordStatus === "TEMPORARY") {
      setIsResetRequired(true);
    } else {
      router.push("/dashboard");
    }
  };

  const handlePasswordReset = (e: React.FormEvent) => {
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

    // Update password status to active in global context
    setCurrentUserPasswordActive();
    router.push("/dashboard");
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-white text-slate-800 overflow-hidden">

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
            src="/Blue White Professional Minimal Company Business Card (1).png"
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

      {/* Right Panel: Sign-In Container */}
      <div className="flex-1 h-full flex flex-col justify-center items-center p-6 sm:p-10 lg:p-14 bg-white">
        <div className="w-full max-w-[440px]">

          {/* Logo visible only on mobile/tablet — same crop-out-the-padding fix as the desktop logo above */}
          <div className="lg:hidden text-center mb-6">
            <div className="overflow-hidden mx-auto" style={{ width: 156, height: 40 }}>
              <img
                src="/Blue White Professional Minimal Company Business Card (1).png"
                alt="TASKEZY Logo"
                className="max-w-none"
                style={{ width: 186, height: 106, marginTop: -30, marginLeft: -15 }}
              />
            </div>
          </div>

          {!isResetRequired ? (
            /* Login Form Container with precise border box */
            <div className="border border-gray-300 rounded-lg p-8 sm:p-12 bg-white shadow-sm space-y-7">

              <div>
                <h1 className="text-xl xl:text-2xl font-bold text-gray-900 tracking-tight">Sign in to your account</h1>
                <p className="text-xs xl:text-sm text-gray-500 mt-1 font-light">
                  Don&apos;t have an account?{" "}
                  <Link href="/checkout" className="text-blue-500 hover:underline font-normal font-sans">
                    Sign Up
                  </Link>
                </p>
              </div>

              {error && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-650">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Google OAuth Button */}
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 border border-blue-500 rounded-md py-2.5 text-sm font-medium text-blue-500 hover:bg-blue-50/50 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Sign In with Google
              </button>

              {/* Divider */}
              <div className="relative flex items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-4 text-xs text-gray-400 font-light">Or Use Email</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

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
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-md text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-l-md text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="px-3.5 py-3.5 bg-gray-100 border-y border-r border-gray-300 rounded-r-md text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="text-left">
                  <Link href="#" className="text-xs text-blue-500 hover:underline font-normal">
                    Forgot Password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#7CA8F6] hover:bg-blue-500 disabled:opacity-60 text-white font-medium py-2.5 rounded-md text-sm transition-colors mt-8 shadow-sm"
                >
                  {isSubmitting ? "Signing in..." : "Continue"}
                </button>

                <div className="text-center mt-4">
                  <p className="text-[11px] sm:text-xs text-gray-500 font-light">
                    Need to create a new tenant?{" "}
                    <Link href="/checkout" className="text-blue-500 hover:underline font-normal">
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
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-650">
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
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-md text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-md text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-md text-sm transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Secure and Login
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
