import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="w-full max-w-4xl mx-auto px-6 sm:px-8 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <img src="/Blue White Professional Minimal Company Business Card.png" alt="TASKEZY" className="h-8 w-auto object-contain" />
        </Link>
        <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-brand-700 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 sm:px-8 pb-24">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 sm:p-12 space-y-8">
          <div>
            <h1 className="text-2xl font-extrabold text-brand-700">Privacy Policy</h1>
            <p className="text-xs text-slate-450 mt-1">Last updated: August 2026 · Realhubb Ventures Private Limited</p>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            TASKEZY is an internal enterprise operating system built and operated by Realhubb Ventures Private Limited
            (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) to run our own Customer Relationship Management (CRM), Human Resources Management
            (HRMS), and Finance operations. This policy explains what data the platform collects, why, and how it is
            protected.
          </p>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">1. Data We Collect</h2>
            <ul className="list-disc list-inside text-sm text-slate-600 leading-relaxed space-y-1">
              <li><strong>Prospective buyer / lead data:</strong> name, phone number, email, and property interest, sourced from Meta (Facebook/Instagram) Lead Ads, Google Ads campaigns, manual entry by sales staff, or direct walk-ins.</li>
              <li><strong>Employee data:</strong> name, contact details, role, attendance and GPS punch-in location (during working hours only, for HRMS geofencing), leave records, and reimbursement claims.</li>
              <li><strong>Financial records:</strong> invoices, brokerage/commission calculations, and payment status tied to bookings.</li>
              <li><strong>Platform usage data:</strong> login sessions and audit logs of actions taken within the CRM (e.g. lead status changes, reassignments) for accountability and dispute resolution.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">2. How We Use This Data</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Data is used exclusively to operate our real estate brokerage business: routing and following up on leads,
              tracking sales pipeline and bookings, managing our workforce&apos;s attendance and payroll-adjacent records, and
              generating compliant GST invoices. We do not sell lead or employee data to third parties.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">3. Third-Party Data Sources</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Leads may arrive via Meta&apos;s Lead Ads webhook or be attributed to Google Ads campaigns we run. Meta and
              Google act as the source of that contact&apos;s initial consent to be contacted about the property they showed
              interest in; we do not independently re-verify that consent beyond what each platform&apos;s lead form already
              captured at submission.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">4. Data Storage &amp; Security</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              All data is stored in a PostgreSQL database hosted on AWS (ap-south-1, Mumbai), accessed only via
              authenticated, role-scoped API requests over HTTPS. Third-party ad-platform access tokens are encrypted at
              rest (AES-256-GCM) and are never exposed to the browser. Access within the platform is restricted by role
              (Admin, Manager, Sales Agent, Finance) so a user only sees the data relevant to their function.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">5. Data Retention</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Lead and employee records are retained for as long as needed for active business operations and
              statutory/tax compliance (invoices are retained per applicable GST record-keeping requirements). A lead or
              employee may request deletion of their personal data by contacting us using the details below, subject to
              records we are legally required to retain.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">6. Contact</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Questions about this policy or a data request can be directed to Realhubb Ventures Private Limited through
              your assigned company point of contact.
            </p>
          </section>

          <p className="text-[11px] text-slate-400 italic border-t border-slate-100 pt-4">
            This document describes the platform&apos;s actual data handling as implemented and is provided for internal
            transparency. It is not a substitute for formal legal counsel — a fully reviewed, legally binding version
            should be published before this platform is used with any party outside Realhubb Ventures.
          </p>
        </div>
      </main>
    </div>
  );
}
