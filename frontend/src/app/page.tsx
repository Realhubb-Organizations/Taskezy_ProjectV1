import Link from "next/link";
import { ArrowRight, Zap, Users, Compass, Calculator, Sparkles, ChevronRight } from "lucide-react";
import RevealOnScroll from "@/components/RevealOnScroll";
import HeroBackgroundLottie from "@/components/HeroBackgroundLottie";
import LeadIngestionAnimation from "@/components/LeadIngestionAnimation";
import EnterpriseModulesShowcase from "@/components/EnterpriseModulesShowcase";
import LogoLottie from "@/components/LogoLottie";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between overflow-x-hidden relative">
      {/* Pro UI/UX Header */}
      <header className="sticky top-4 z-50 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-300">
        <div className="relative flex items-center justify-between px-6 sm:px-8 py-3.5 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-xl shadow-lg shadow-slate-900/5 transition-all duration-300 hover:border-slate-300/90 hover:shadow-xl hover:shadow-slate-900/10">
          
          {/* Animated Vector Logo */}
          <Link
            href="/"
            className="flex items-center focus:outline-none"
          >
            <LogoLottie />
          </Link>

          {/* User Actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/auth/login"
              className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 px-3.5 py-2 rounded-xl hover:bg-slate-100/80 transition-all duration-200"
            >
              Sign In
            </Link>

            <Link
              href="/checkout"
              className="group relative inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all duration-300 shadow-md shadow-slate-900/10 hover:shadow-lg hover:shadow-slate-900/20 hover:-translate-y-0.5 active:translate-y-0 overflow-hidden"
            >
              <span>Configure Plan</span>
              <ArrowRight className="w-4 h-4 text-slate-300 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-white" />
            </Link>
          </div>

        </div>
      </header>

      {/* Hero Section - Executive Modern Enterprise */}
      <main className="relative z-10 flex-grow max-w-7xl mx-auto px-6 sm:px-8 pt-16 sm:pt-24 pb-20 flex flex-col items-center text-center">

        <div className="relative z-10 flex flex-col items-center max-w-4xl">
          {/* Subtle Announcement Chip */}
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200/60 text-xs font-semibold text-slate-700 mb-8 hover:bg-slate-200/50 transition-colors cursor-pointer group">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Taskezy Enterprise v2.4</span>
           
          </div>

          {/* Editorial Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.08] mb-6">
            The simple business operating system for{" "}
            <span className="text-slate-900 font-extrabold">
              modern real estate.
            </span>
          </h1>

          {/* Clean Subtitle */}
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mb-10 leading-relaxed font-normal">
            Unify sales CRM pipelines, geofenced team attendance, and compliant client invoicing in one intuitive enterprise platform.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto mb-16">
            <Link
              href="/checkout"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm px-6 py-3.5 rounded-xl transition-all shadow-sm hover:shadow active:scale-[0.99]"
            >
              <span>Configure Subscription</span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </Link>
            <Link
              href="/auth/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm px-6 py-3.5 rounded-xl transition-all shadow-2xs"
            >
              <span>Access Roster Portal</span>
            </Link>
          </div>

          {/* Minimal Enterprise Proof Bar */}
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 text-xs font-medium text-slate-500 pt-8 border-t border-slate-200/60 w-full">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>SOC2 Type II Certified</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>99.99% Uptime SLA</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>GST Compliant</span>
            </div>
          </div>
        </div>

        {/* Multi-Channel Lead Ingestion Animation Section */}
        <RevealOnScroll className="w-full mt-16 mb-12">
          <div className="text-center mb-6">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Automated Lead Ingestion
            </h2>
            <p className="text-base text-slate-600 max-w-xl mx-auto mt-2">
              Route incoming buyer inquiries from Meta Ads, WhatsApp, and Google PPC straight into your CRM.
            </p>
          </div>
          <LeadIngestionAnimation />
        </RevealOnScroll>

        {/* Core Enterprise Modules Showcase (From priya commit 26fac08) */}
        <section className="w-full pt-16">
          <RevealOnScroll className="w-full">
            <EnterpriseModulesShowcase />
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

