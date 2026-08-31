"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Lock, Mail, ShieldCheck, AlertCircle, Eye, EyeOff, Sparkles } from "lucide-react";
import Link from "next/link";
import LoginSlideVisual from "@/components/auth/LoginSlideVisual";

const slides: { variant: "dashboard" | "leads"; title: string; description: string }[] = [
  {
    variant: "dashboard",
    title: "Managing Team just got easier",
    description: "Simplify team management and drive better results with unprecedented real-time visibility across your entire portfolio."
  },
  {
    variant: "leads",
    title: "Deeper insights into your business",
    description: "Transform scattered data into actionable intelligence and deeper business visibility."
  }
];

export default function LoginPage() {
  const router = useRouter();
  const { loginWithTempPassword, currentUser, setCurrentUserPasswordActive } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [googleNotice, setGoogleNotice] = useState("");
  const [forgotNotice, setForgotNotice] = useState(false);

  // Force Password Reset Flow state
  const [isResetRequired, setIsResetRequired] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

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
      {/* Left Panel: Carousel */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] h-full p-10 xl:p-14 bg-gradient-to-br from-[#5b7ef0] via-[#1f47d3] to-[#0b1d6e] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.08),transparent)] pointer-events-none" />

        <Link href="/" className="z-20 inline-flex bg-white rounded-lg px-3 py-1.5 shadow-md w-fit overflow-hidden" style={{ height: 34 }}>
          <img
            src="/Blue White Professional Minimal Company Business Card (1).png"
            alt="TASKEZY Logo"
            className="h-full w-auto object-contain"
          />
        </Link>

        <div className="flex-1 flex flex-col items-center justify-center w-full z-10 my-4">
          <div className="w-full max-w-[420px] xl:max-w-[440px] mb-8">
            <LoginSlideVisual variant={slides[currentSlide].variant} />
          </div>

          <div className="text-center space-y-2 max-w-md px-4">
            <h2 className="text-xl xl:text-2xl font-bold tracking-tight">{slides[currentSlide].title}</h2>
            <p className="text-[11px] xl:text-xs text-blue-100/85 leading-relaxed font-light">
              {slides[currentSlide].description}
            </p>
          </div>

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

        <div className="z-10 flex items-center justify-center gap-6 text-xs xl:text-sm text-white/90">
          <Link href="/privacy-policy" className="hover:underline font-medium">
            Privacy Policy
          </Link>
          <span className="text-white/30">|</span>
          <Link href="/terms" className="hover:underline font-medium">
            Terms
          </Link>
        </div>
      </div>

      {/* Right Panel: Sign-In */}
      <div className="flex-1 h-full flex flex-col justify-center items-center p-6 sm:p-10 lg:p-14 bg-white overflow-y-auto">
        <div className="w-full max-w-[440px]">
          <div className="lg:hidden text-center mb-6">
            <img
              src="/Blue White Professional Minimal Company Business Card (1).png"
              alt="TASKEZY Logo"
              className="h-10 w-auto object-contain mx-auto"
            />
          </div>

          {!isResetRequired ? (
            <div className="border border-gray-200 rounded-2xl p-8 sm:p-10 bg-white shadow-sm space-y-6">
              <div>
                <h1 className="text-xl xl:text-2xl font-bold text-gray-900 tracking-tight">Sign in to your account</h1>
                <p className="text-xs text-gray-500 mt-1">
                  Need to create a new tenant?{" "}
                  <Link href="/checkout" className="text-brand-600 hover:underline font-medium">
                    Configure a subscription plan
                  </Link>
                </p>
              </div>

              {error && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-650">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Google Sign-In isn't wired to a real backend flow yet — this
                  says so honestly instead of silently doing nothing. */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setGoogleNotice("Google Sign-In isn't connected yet — please use your email and password below.")}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Sign In with Google
                </button>
                {googleNotice && <p className="text-[10px] text-slate-450 text-center">{googleNotice}</p>}
              </div>

              <div className="relative flex items-center">
                <div className="flex-grow border-t border-gray-200" />
                <span className="flex-shrink mx-4 text-xs text-gray-400 font-light">Or Use Email</span>
                <div className="flex-grow border-t border-gray-200" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="abc@example.com"
                      className="w-full bg-slate-50 border border-slate-205 focus:border-brand-500 rounded-lg pl-10 pr-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-205 focus:border-brand-500 rounded-lg pl-10 pr-10 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-left">
                  {!forgotNotice ? (
                    <button
                      type="button"
                      onClick={() => setForgotNotice(true)}
                      className="text-xs text-brand-600 hover:underline font-medium"
                    >
                      Forgot Password?
                    </button>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      Self-service reset isn&apos;t available yet — please contact your Administrator to reset your password.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-brand-700 hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-md shadow-brand-700/10"
                >
                  {isSubmitting ? "Signing in..." : "Continue"}
                </button>
              </form>
            </div>
          ) : (
            /* Enforced Reset Form */
            <div className="border border-gray-200 rounded-2xl p-8 sm:p-10 bg-white shadow-sm space-y-6">
              <div className="flex gap-2.5 items-center p-3 rounded-xl bg-brand-50 border border-brand-100">
                <Sparkles className="h-5 w-5 text-brand-600 flex-shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-brand-850">First-time Login Detected</h4>
                  <p className="text-[10px] text-brand-700">Password reset is strictly enforced for new accounts.</p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900">Configure Active Password</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Establish a secure password for user <span className="text-brand-700 font-bold">{currentUser?.email}</span>.
                </p>
              </div>

              {resetError && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-650">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-500 rounded-lg px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-500 rounded-lg px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-1.5"
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
