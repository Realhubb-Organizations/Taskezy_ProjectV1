import Link from "next/link";
import { ArrowRight, Zap, Users, Compass, Calculator } from "lucide-react";
import RevealOnScroll from "@/components/RevealOnScroll";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between overflow-x-hidden relative">
      {/* Background gradients — slow ambient drift for depth without being distracting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] pointer-events-none overflow-hidden opacity-40 z-0">
        <div className="absolute -top-40 left-10 w-[500px] h-[500px] rounded-full bg-brand-200/20 blur-[120px] animate-blob-float" />
        <div
          className="absolute -top-30 right-10 w-[400px] h-[400px] rounded-full bg-brand-100/30 blur-[100px] animate-blob-float"
          style={{ animationDelay: "-6s", animationDuration: "20s" }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between border-b border-slate-200/80 bg-white/40 backdrop-blur-md animate-fade-in-up">
        <Link href="/" className="flex items-center">
          <img
            src="/Blue White Professional Minimal Company Business Card (1).png"
            alt="TASKEZY Logo"
            className="h-10 w-auto object-contain"
          />
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/auth/login"
            className="text-sm font-semibold text-slate-600 hover:text-brand-700 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/checkout"
            className="text-sm font-semibold bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg transition-all duration-300 hover:-translate-y-0.5 shadow-md shadow-brand-700/10 hover:shadow-lg hover:shadow-brand-700/20"
          >
            Configure Plan
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-grow max-w-7xl mx-auto px-6 sm:px-8 py-20 flex flex-col items-center justify-center text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-xs text-brand-700 font-bold mb-8 backdrop-blur-md animate-fade-in-up"
          style={{ animationDelay: "80ms" }}
        >
          <Zap className="h-3.5 w-3.5 text-brand-500" />
          <span>Next-Generation Real Estate Operations</span>
        </div>

        <h1
          className="text-4xl sm:text-6xl font-extrabold tracking-tight text-brand-700 max-w-4xl leading-tight mb-6 animate-fade-in-up"
          style={{ animationDelay: "160ms" }}
        >
          The Business Operating System for{" "}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-700 via-brand-500 to-brand-700 animate-gradient-shift">
            Real Estate Enterprise
          </span>
        </h1>

        <p
          className="text-base sm:text-lg text-slate-600 max-w-2xl mb-10 leading-relaxed animate-fade-in-up"
          style={{ animationDelay: "240ms" }}
        >
          Unify your Sales Pipeline (CRM), Geofenced HR Telemetry (HRMS), and Compliance Finance Ledgers under a secure, logical PostgreSQL multi-tenant architecture.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-20 animate-fade-in-up" style={{ animationDelay: "320ms" }}>
          <Link
            href="/checkout"
            className="btn-shimmer inline-flex items-center gap-2 bg-gradient-to-r from-brand-700 to-brand-600 hover:from-brand-650 hover:to-brand-500 text-white font-semibold px-8 py-4 rounded-xl transition-all duration-300 hover:-translate-y-0.5 shadow-lg shadow-brand-700/15 hover:shadow-xl hover:shadow-brand-700/25 group"
          >
            Configure Subscription
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-8 py-4 rounded-xl transition-all duration-300 hover:-translate-y-0.5 shadow-sm hover:shadow-md"
          >
            Access Roster Portal
          </Link>
        </div>

        {/* Feature Contexts — reveal on scroll into view, staggered */}
        <section className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {/* CRM Card */}
          <RevealOnScroll delayMs={0}>
            <div className="glass-card glass-card-hover p-6 rounded-2xl relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="h-10 w-10 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 mb-4">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-brand-700 mb-2">Sales CRM Pipeline</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Auto-ingest leads from Facebook and Instagram via OAuth 2.0 Page Webhooks. Restrict pipeline progression with strict DAG rules and Indian phone validation logic.
              </p>
            </div>
          </RevealOnScroll>

          {/* HRMS Card */}
          <RevealOnScroll delayMs={120}>
            <div className="glass-card glass-card-hover p-6 rounded-2xl relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-4">
                <Compass className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-brand-700 mb-2">Geofenced HRMS</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Field telemetry tracking via precise GPS boundary check. Automated timesheet audit with 4-hour half-day rules and administrator regularization workflow.
              </p>
            </div>
          </RevealOnScroll>

          {/* Finance Card */}
          <RevealOnScroll delayMs={240}>
            <div className="glass-card glass-card-hover p-6 rounded-2xl relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="h-10 w-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-4">
                <Calculator className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-brand-700 mb-2">Tax &amp; Compliance</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Automated draft bookings synced from bookings. Verify KYC documents before generating sequential invoices with Indian taxation (9% CGST + 9% SGST).
              </p>
            </div>
          </RevealOnScroll>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 bg-white/10">
        <p>&copy; 2026 TASKEZY Real Estate Platform. All rights reserved.</p>
        <div className="flex gap-4 mt-4 sm:mt-0">
          <Link href="/SDLC_MANUAL.md" className="hover:text-slate-800 transition-colors">
            SDLC Guidelines
          </Link>
          <Link href="/ARCHITECTURAL_BLUEPRINT.md" className="hover:text-slate-800 transition-colors">
            Architectural Design
          </Link>
        </div>
      </footer>
    </div>
  );
}
