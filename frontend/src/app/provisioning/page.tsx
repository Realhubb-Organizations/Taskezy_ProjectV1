"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Database, ShieldCheck, UserCheck, Key, FileText, ChevronRight, Lock, Check } from "lucide-react";

export default function ProvisioningPage() {
  const router = useRouter();
  const { isPaid, isProvisioned, provisionTenant, users } = useApp();
  const [step, setStep] = useState(0);

  const steps = [
    { label: "Validating Razorpay Checkout signature...", icon: ShieldCheck },
    { label: "Initializing PostgreSQL AWS RDS isolated database schema...", icon: Database },
    { label: "Generating user profiles for roles (Admin, Finance, Agents)...", icon: UserCheck },
    { label: "Encrypting temporary high-entropy credentials...", icon: Key }
  ];

  useEffect(() => {
    // Redirect back to checkout if payment was not verified
    if (!isPaid) {
      router.push("/checkout");
      return;
    }

    let isMounted = true;

    const runProvisioning = async () => {
      // Step interval animation
      for (let i = 0; i < steps.length; i++) {
        if (!isMounted) return;
        setStep(i);
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      if (!isMounted) return;
      setStep(steps.length);
      await provisionTenant();
    };

    runProvisioning();

    return () => {
      isMounted = false;
    };
  }, [isPaid]);

  const handleDownloadRoster = () => {
    // Generate text/csv roster download as mock PDF download
    let content = "TASKEZY ENTERPRISE PORTAL - CREDENTIAL ROSTER\n";
    content += "==================================================\n";
    content += "Tenant Domain: Private PostgreSQL Isolated Partition\n";
    content += "Generated At: " + new Date().toLocaleString() + "\n\n";
    content += "MANDATORY SECURITY WARNING:\n";
    content += "This roster must only be held by the Global Administrator.\n";
    content += "Each user must have their temporary credentials reset by the\n";
    content += "Administrator inside the Cockpit before distribution.\n\n";
    content += "ROSTER ACCOUNTS:\n";
    content += "--------------------------------------------------\n";
    users.forEach((u) => {
      content += `Role: ${u.role}\nName: ${u.name}\nEmail: ${u.email}\nTemp Password: ${u.tempPassword || "N/A (Active)"}\n\n`;
    });

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taskezy_credential_roster_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Glow circles */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-100/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-2xl">
        {!isProvisioned ? (
          /* Running State */
          <div className="glass-card p-8 rounded-3xl text-center space-y-8">
            <div className="flex justify-center">
              <div className="relative">
                <div className="h-16 w-16 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
                  <Database className="h-8 w-8 animate-pulse" />
                </div>
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-brand-600 rounded-full animate-ping" />
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-brand-700 mb-2">Zero-Touch Automated Provisioning</h2>
              <p className="text-xs text-slate-500">
                Initializing your isolated database and role permissions. Do not close this window.
              </p>
            </div>

            <div className="space-y-3 text-left max-w-md mx-auto">
              {steps.map((s, idx) => {
                const isDone = step > idx;
                const isCurrent = step === idx;
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-lg text-xs font-bold border transition-all duration-300 ${
                      isDone
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : isCurrent
                        ? "border-brand-300 bg-brand-50 text-brand-700 shadow-md shadow-brand-500/5"
                        : "border-slate-200 bg-slate-100/30 text-slate-450"
                    }`}
                  >
                    <s.icon className={`h-4.5 w-4.5 ${isCurrent ? "animate-pulse" : ""}`} />
                    <span>{s.label}</span>
                    {isDone && <Check className="ml-auto h-4 w-4 text-emerald-600" />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Finished State / Handover */
          <div className="glass-card p-8 rounded-3xl space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-extrabold text-brand-700">Provisioning Complete</h2>
              <p className="text-xs text-slate-500 mt-1">
                Your logical PostgreSQL partition is live on AWS RDS.
              </p>
            </div>

            {/* Security Warning Box */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3 text-xs leading-relaxed text-amber-800">
              <Lock className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 mb-1">Enforced Password Governance (MANDATORY)</p>
                <p className="text-slate-700">
                  Only you (Global Administrator) receive this credentials roster. The platform strictly requires you to log in and manually update/reset the temporary password of each subordinate before handing them out.
                </p>
              </div>
            </div>

            {/* Credential Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                <div className="col-span-3">Role</div>
                <div className="col-span-5">Login ID</div>
                <div className="col-span-4 text-right">Temp Pass</div>
              </div>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {users.map((u) => (
                  <div key={u.id} className="grid grid-cols-12 px-4 py-3 text-xs items-center">
                    <div className="col-span-3 font-bold text-slate-700">
                      {u.role === "ADMIN" && "Administrator"}
                      {u.role === "FINANCE" && "Finance Ops"}
                      {u.role === "AGENT" && "Sales Agent"}
                    </div>
                    <div className="col-span-5 text-slate-500 truncate pr-2">{u.email}</div>
                    <div className="col-span-4 text-right font-mono text-brand-600 font-extrabold">
                      {u.tempPassword}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleDownloadRoster}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-lg text-sm border border-slate-350 transition-all"
              >
                <FileText className="h-4.5 w-4.5 text-slate-500" />
                Download Roster (.TXT)
              </button>
              <button
                onClick={() => router.push("/auth/login")}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-600 text-white font-semibold py-3 rounded-lg text-sm transition-all shadow-md shadow-brand-700/15"
              >
                Proceed to Login
                <ChevronRight className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
