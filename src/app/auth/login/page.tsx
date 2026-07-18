"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Lock, Mail, ShieldCheck, AlertCircle, Eye, EyeOff, Sparkles } from "lucide-react";
import Link from "next/link";

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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    const user = loginWithTempPassword(email, password);
    if (!user) {
      setError("Invalid email address or temporary password. Please check your downloaded roster.");
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
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Background radial effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-100/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md">
        {/* Header Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-2">
            <img
              src="/Blue White Professional Minimal Company Business Card (1).png"
              alt="TASKEZY Logo"
              className="h-12 w-auto object-contain mx-auto"
            />
          </Link>
          <p className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">Enterprise Operations Control Center</p>
        </div>

        {!isResetRequired ? (
          /* Login Form */
          <div className="glass-card p-8 rounded-3xl space-y-6">
            <div>
              <h3 className="text-lg font-bold text-brand-700">Sign In</h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter your roster credentials to access your tenant cockpit.
              </p>
            </div>

            {error && (
              <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-650">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wide">
                  Corporate Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@taskezy.com"
                    className="w-full bg-slate-50 border border-slate-205 focus:border-brand-500 rounded-lg pl-10 pr-4 py-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wide">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter roster password"
                    className="w-full bg-slate-50 border border-slate-205 focus:border-brand-500 rounded-lg pl-10 pr-10 py-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
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

              <button
                type="submit"
                className="w-full bg-brand-700 hover:bg-brand-600 text-white font-semibold py-3 rounded-lg text-xs transition-all shadow-md shadow-brand-700/10"
              >
                Access Account
              </button>
            </form>

            <div className="border-t border-slate-200 pt-4 text-center">
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                Need to create a new tenant?{" "}
                <Link href="/checkout" className="text-brand-600 hover:underline">
                  Configure a subscription plan
                </Link>
              </p>
            </div>
          </div>
        ) : (
          /* Enforced Reset Form */
          <div className="glass-card p-8 rounded-3xl space-y-6 border border-brand-200 bg-brand-50/10">
            <div className="flex gap-2.5 items-center p-3 rounded-xl bg-brand-50 border border-brand-100">
              <Sparkles className="h-5 w-5 text-brand-600 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-brand-850">First-time Login Detected</h4>
                <p className="text-[10px] text-brand-700">
                  Password reset is strictly enforced for new accounts.
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-brand-700">Configure Active Password</h3>
              <p className="text-xs text-slate-500 mt-1">
                Establish a secure password for user <span className="text-brand-700 font-bold">{currentUser?.email}</span>.
              </p>
            </div>

            {resetError && (
              <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-250 text-xs text-red-650">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wide">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-brand-500 rounded-lg px-4 py-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wide">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-brand-500 rounded-lg px-4 py-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg text-xs transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="h-4 w-4" />
                Secure and Login
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
