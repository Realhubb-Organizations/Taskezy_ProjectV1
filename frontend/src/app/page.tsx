import Link from "next/link";
import { ArrowRight, Zap, Users, Compass, Calculator, ShieldCheck, Database, Layers, CheckCircle2, Award, Building2, TrendingUp, Sparkles } from "lucide-react";
import RevealOnScroll from "@/components/RevealOnScroll";
import HeroBackgroundLottie from "@/components/HeroBackgroundLottie";
import LeadIngestionAnimation from "@/components/LeadIngestionAnimation";
import EnterpriseModulesShowcase from "@/components/EnterpriseModulesShowcase";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-900 flex flex-col justify-between overflow-x-hidden relative selection:bg-brand-500 selection:text-white">
      
      {/* Luxurious Atmospheric Radial Lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[700px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-100/40 via-brand-50/20 to-transparent pointer-events-none -z-10 blur-3xl" />
      <div className="absolute top-32 right-12 w-[30rem] h-[30rem] bg-brand-500/8 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="absolute top-96 left-8 w-[30rem] h-[30rem] bg-blue-600/8 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* Ultra-Executive Glass Top Header Navigation */}
      <header className="sticky top-4 z-50 w-full max-w-7xl mx-auto px-4 sm:px-8">
        <div className="w-full h-16 sm:h-18 px-6 sm:px-8 flex items-center justify-between border border-slate-200/90 bg-white/90 backdrop-blur-2xl rounded-2xl shadow-lg shadow-slate-900/5">
          
          {/* Perfectly Aligned Logo */}
          <Link href="/" className="flex items-center shrink-0 group">
            <img
              src="/taskezy_logo_clean.png"
              alt="TASKEZY Enterprise OS"
              className="h-7 sm:h-8 w-auto object-contain -translate-y-0.5 transition-transform duration-300 group-hover:scale-105"
            />
          </Link>

          {/* Centered Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 lg:gap-10 text-sm font-bold text-slate-700">
            <a href="#leads-engine" className="hover:text-brand-500 transition-colors py-1 relative group whitespace-nowrap">
              CRM Engine
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-brand-500 transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#hrms" className="hover:text-brand-500 transition-colors py-1 relative group whitespace-nowrap">
              HRMS Telemetry
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-brand-500 transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#compliance" className="hover:text-brand-500 transition-colors py-1 relative group whitespace-nowrap">
              Tax &amp; Compliance
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-brand-500 transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#architecture" className="hover:text-brand-500 transition-colors py-1 relative group whitespace-nowrap">
              Architecture
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-brand-500 transition-all duration-300 group-hover:w-full" />
            </a>
          </nav>

          {/* Right Action CTAs */}
          <div className="flex items-center gap-4 shrink-0">
            <Link
              href="/auth/login"
              className="text-sm font-bold text-slate-700 hover:text-brand-700 px-3.5 py-2 rounded-xl hover:bg-slate-100/80 transition-all whitespace-nowrap"
            >
              Sign In
            </Link>
            <Link
              href="/checkout"
              className="btn-shimmer text-sm font-extrabold bg-gradient-to-r from-brand-700 via-brand-800 to-brand-700 hover:from-brand-800 hover:to-brand-900 text-white px-6 py-2.5 rounded-xl transition-all duration-300 shadow-md shadow-brand-700/25 hover:shadow-xl hover:shadow-brand-700/35 hover:-translate-y-0.5 whitespace-nowrap"
            >
              Configure Plan
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-grow max-w-7xl mx-auto px-4 sm:px-8 pt-10 pb-28 flex flex-col items-center">
        
        {/* Hero Section */}
        <div className="relative w-full flex flex-col items-center text-center max-w-5xl pt-6 pb-8">
          <HeroBackgroundLottie />

          <div className="relative z-10 flex flex-col items-center">
            {/* Top Enterprise Status Pill */}
            <div
              className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-slate-200/90 bg-white/95 text-xs text-slate-800 font-extrabold mb-8 shadow-sm backdrop-blur-xl animate-fade-in-up"
              style={{ animationDelay: "80ms" }}
            >
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="uppercase tracking-widest text-slate-700">TASKEZY Enterprise Platform &bull; Real Estate OS</span>
            </div>

            {/* Main Headline */}
            <h1
              className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-brand-700 max-w-5xl leading-[1.12] mb-6 animate-fade-in-up"
              style={{ animationDelay: "160ms" }}
            >
              The Business Operating System for{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-700 via-brand-500 to-blue-600">
                Real Estate Enterprise
              </span>
            </h1>

            {/* Sub-headline */}
            <p
              className="text-base sm:text-xl text-slate-600 max-w-3xl mb-10 leading-relaxed font-normal animate-fade-in-up"
              style={{ animationDelay: "240ms" }}
            >
              Unify your <strong className="text-slate-900 font-bold">Sales Pipeline (CRM)</strong>, <strong className="text-slate-900 font-bold">Geofenced Field Roster (HRMS)</strong>, and <strong className="text-slate-900 font-bold">Compliance Finance Ledgers</strong> under a secure PostgreSQL multi-tenant architecture.
            </p>

            {/* Hero CTAs */}
            <div
              className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto animate-fade-in-up"
              style={{ animationDelay: "320ms" }}
            >
              <Link
                href="/checkout"
                className="btn-shimmer w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-gradient-to-r from-brand-700 via-brand-800 to-brand-700 hover:from-brand-800 hover:to-brand-900 text-white font-extrabold text-base px-9 py-4 rounded-2xl transition-all duration-300 hover:-translate-y-0.5 shadow-2xl shadow-brand-700/25 hover:shadow-brand-700/40 group"
              >
                Configure Subscription
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/auth/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-slate-200/90 bg-white hover:bg-slate-50/80 text-slate-800 font-extrabold text-base px-9 py-4 rounded-2xl transition-all duration-300 hover:-translate-y-0.5 shadow-sm hover:shadow-md"
              >
                Access Roster Portal
              </Link>
            </div>

            {/* Premium Metric Cards Grid */}
            <div
              className="mt-14 w-full grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 animate-fade-in-up"
              style={{ animationDelay: "400ms" }}
            >
              <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-brand-200 transition-all text-center">
                <div className="text-2xl sm:text-3xl font-black text-brand-700 tracking-tight">₹500Cr+</div>
                <div className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Pipeline Inventory</div>
              </div>

              <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-brand-200 transition-all text-center">
                <div className="text-2xl sm:text-3xl font-black text-brand-700 tracking-tight">99.9%</div>
                <div className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">GPS Telemetry Uptime</div>
              </div>

              <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-brand-200 transition-all text-center">
                <div className="text-2xl sm:text-3xl font-black text-brand-700 tracking-tight">OAuth 2.0</div>
                <div className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Meta Webhooks Sync</div>
              </div>

              <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-brand-200 transition-all text-center">
                <div className="text-2xl sm:text-3xl font-black text-brand-700 tracking-tight">100%</div>
                <div className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Indian GST Compliant</div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Showcase: IMAGE 3 MULTI-CHANNEL INGESTION ANIMATION */}
        <section id="leads-engine" className="w-full pt-16">
          <RevealOnScroll className="w-full">
            <div className="text-center mb-6">
              <h2 className="text-3xl sm:text-5xl font-black text-brand-700 tracking-tight">
                Automated Lead Ingestion
              </h2>
              <p className="text-base text-slate-600 max-w-xl mx-auto mt-2">
                Route incoming buyer inquiries from Meta Ads, WhatsApp, and Google PPC straight into your CRM.
              </p>
            </div>

            {/* Render Image 3 Component */}
            <LeadIngestionAnimation />
          </RevealOnScroll>
        </section>

        {/* Core Enterprise Modules */}
        <section id="hrms" className="w-full pt-16">
          <RevealOnScroll className="w-full">
            <EnterpriseModulesShowcase />
          </RevealOnScroll>
        </section>

        {/* PostgreSQL Architecture Showcase */}
        <section id="architecture" className="w-full pt-16">
          <RevealOnScroll className="w-full">
            <div className="bg-gradient-to-b from-white via-blue-50/20 to-slate-50/50 border border-slate-200/90 rounded-3xl p-8 sm:p-12 shadow-xl text-slate-900 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center relative z-10">
                <div className="lg:col-span-7">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-extrabold text-blue-600 mb-4 shadow-sm">
                    <Database className="w-4 h-4 text-blue-600" />
                    <span>PostgreSQL Multi-Tenant Engine</span>
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mb-4">
                    Strict Data Isolation &amp; Enterprise Governance
                  </h3>
                  <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-8 font-normal">
                    TASKEZY utilizes logical database multi-tenancy, ensuring enterprise tenant data is completely isolated. Built for high-concurrency real estate operations, real-time analytics, and auditable compliance logs.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200/90 p-4 rounded-xl shadow-sm">
                      <div className="text-3xl font-black text-blue-600">100%</div>
                      <div className="text-xs font-semibold text-slate-600 mt-1">Tenant Isolation</div>
                    </div>
                    <div className="bg-white border border-slate-200/90 p-4 rounded-xl shadow-sm">
                      <div className="text-3xl font-black text-blue-600">&lt; 100ms</div>
                      <div className="text-xs font-semibold text-slate-600 mt-1">Webhook Latency</div>
                    </div>
                    <div className="bg-white border border-slate-200/90 p-4 rounded-xl shadow-sm col-span-2 sm:col-span-1">
                      <div className="text-3xl font-black text-blue-600">256-bit</div>
                      <div className="text-xs font-semibold text-slate-600 mt-1">Payload Encryption</div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 flex justify-center">
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-md w-full max-w-md space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                        <ShieldCheck className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">OAuth 2.0 Webhook Receiver</div>
                        <div className="text-xs text-slate-500">Strict signature validation</div>
                      </div>
                    </div>
                    <div className="h-px bg-slate-200/80" />
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                        <Layers className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">DAG Lead Workflow Engine</div>
                        <div className="text-xs text-slate-500">Automated stage transitions</div>
                      </div>
                    </div>
                    <div className="h-px bg-slate-200/80" />
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                        <Compass className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">Geofenced GPS Telemetry</div>
                        <div className="text-xs text-slate-500">High-accuracy radius audit</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </RevealOnScroll>
        </section>

      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-slate-200 bg-white/90 backdrop-blur-md py-8">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/taskezy_logo_clean.png"
              alt="TASKEZY"
              className="h-7 w-auto object-contain opacity-80"
            />
            <p>&copy; 2026 TASKEZY Real Estate Platform. All rights reserved.</p>
          </div>
          <div className="flex gap-6 font-bold">
            <Link href="/SDLC_MANUAL.md" className="hover:text-brand-700 transition-colors">
              SDLC Guidelines
            </Link>
            <Link href="/ARCHITECTURAL_BLUEPRINT.md" className="hover:text-brand-700 transition-colors">
              Architectural Design
            </Link>
            <Link href="/auth/login" className="hover:text-brand-700 transition-colors">
              Portal Access
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
