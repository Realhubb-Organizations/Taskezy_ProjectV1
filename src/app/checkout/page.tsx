"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ArrowLeft, CreditCard, CheckCircle, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";

export default function CheckoutPage() {
  const router = useRouter();
  const {
    adminSeats,
    financeSeats,
    agentSeats,
    setSeats,
    processPayment
  } = useApp();

  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<"upi" | "card" | "netbanking">("upi");
  const [upiId, setUpiId] = useState("");

  const ADMIN_PRICE = 1000;
  const FINANCE_PRICE = 1000;
  const AGENT_PRICE = 500;
  const GST_RATE = 0.18;

  const adminSubtotal = adminSeats * ADMIN_PRICE;
  const financeSubtotal = financeSeats * FINANCE_PRICE;
  const agentSubtotal = agentSeats * AGENT_PRICE;

  const subtotal = adminSubtotal + financeSubtotal + agentSubtotal;
  const gstAmount = subtotal * GST_RATE;
  const total = subtotal + gstAmount;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMethod === "upi" && !upiId) {
      alert("Please enter a UPI ID");
      return;
    }
    setLoading(true);
    const success = await processPayment();
    setLoading(false);
    if (success) {
      router.push("/provisioning");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between relative overflow-x-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-brand-100/30 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-brand-200/20 blur-[80px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-semibold">Back to home</span>
        </Link>
        <span className="text-xs text-slate-550 font-medium">STEP 1 OF 3: PLAN SELECTION</span>
      </header>

      {/* Main Grid */}
      <main className="relative z-10 flex-grow max-w-7xl w-full mx-auto px-6 sm:px-8 py-4 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Seat Configurator */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card p-6 sm:p-8 rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-brand-500" />
              <h2 className="text-xl font-bold text-brand-700">Configure SaaS Plan</h2>
            </div>
            <p className="text-xs text-slate-500 mb-8">
              Adjust seats for each department below. Licenses are billed monthly and can be upgraded at any time.
            </p>

            <div className="space-y-4">
              {/* Admin Seats */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-800">Global Administrators</h4>
                  <p className="text-xs text-slate-500">₹1,000 / seat / month</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSeats("ADMIN", adminSeats - 1)}
                    className="h-8 w-8 rounded bg-slate-200 hover:bg-slate-350 font-bold flex items-center justify-center text-slate-650"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-slate-800">{adminSeats}</span>
                  <button
                    onClick={() => setSeats("ADMIN", adminSeats + 1)}
                    className="h-8 w-8 rounded bg-slate-200 hover:bg-slate-350 font-bold flex items-center justify-center text-slate-650"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Finance Seats */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-800">Finance Operations</h4>
                  <p className="text-xs text-slate-500">₹1,000 / seat / month</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSeats("FINANCE", financeSeats - 1)}
                    className="h-8 w-8 rounded bg-slate-200 hover:bg-slate-355 font-bold flex items-center justify-center text-slate-650"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-slate-800">{financeSeats}</span>
                  <button
                    onClick={() => setSeats("FINANCE", financeSeats + 1)}
                    className="h-8 w-8 rounded bg-slate-200 hover:bg-slate-355 font-bold flex items-center justify-center text-slate-650"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Agent Seats */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-800">Sales &amp; Field Agents</h4>
                  <p className="text-xs text-slate-500">₹500 / seat / month</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSeats("AGENT", agentSeats - 1)}
                    className="h-8 w-8 rounded bg-slate-200 hover:bg-slate-355 font-bold flex items-center justify-center text-slate-650"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-slate-800">{agentSeats}</span>
                  <button
                    onClick={() => setSeats("AGENT", agentSeats + 1)}
                    className="h-8 w-8 rounded bg-slate-200 hover:bg-slate-355 font-bold flex items-center justify-center text-slate-650"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Secure Payment Gateway Interface */}
          <div className="glass-card p-6 sm:p-8 rounded-2xl">
            <h3 className="text-lg font-bold text-brand-700 mb-6 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-brand-500" />
              Secure Payment Gateway
            </h3>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setSelectedMethod("upi")}
                className={`py-3 rounded-lg border text-xs font-bold text-center transition-all ${
                  selectedMethod === "upi"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-slate-50 text-slate-550 hover:bg-slate-100"
                }`}
              >
                UPI Payments
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod("card")}
                className={`py-3 rounded-lg border text-xs font-bold text-center transition-all ${
                  selectedMethod === "card"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-slate-50 text-slate-550 hover:bg-slate-100"
                }`}
              >
                Credit/Debit Card
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod("netbanking")}
                className={`py-3 rounded-lg border text-xs font-bold text-center transition-all ${
                  selectedMethod === "netbanking"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-slate-50 text-slate-555 hover:bg-slate-100"
                }`}
              >
                Net Banking
              </button>
            </div>

            <form onSubmit={handleCheckout} className="space-y-4">
              {selectedMethod === "upi" && (
                <div>
                  <label htmlFor="upi" className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                    UPI address (VPA)
                  </label>
                  <input
                    type="text"
                    id="upi"
                    placeholder="agencyowner@okaxis"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Accepts GPay, PhonePe, Paytm, BHIM</p>
                </div>
              )}

              {selectedMethod === "card" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                      Card Number
                    </label>
                    <input
                      type="text"
                      placeholder="4111 2222 3333 4444"
                      disabled
                      className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-400 cursor-not-allowed"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                        Expiry Date
                      </label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        disabled
                        className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-400 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                        CVV / CVC
                      </label>
                      <input
                        type="password"
                        placeholder="•••"
                        disabled
                        className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-400 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-amber-600 flex items-center gap-1 font-semibold">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Cards disabled for demo sandboxes. Use UPI mode.
                  </p>
                </div>
              )}

              {selectedMethod === "netbanking" && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                    Select Bank
                  </label>
                  <select
                    disabled
                    className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-450 cursor-not-allowed focus:outline-none"
                  >
                    <option>State Bank of India (SBI)</option>
                    <option>HDFC Bank</option>
                    <option>ICICI Bank</option>
                    <option>Axis Bank</option>
                  </select>
                  <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1 font-semibold">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Netbanking disabled for demo sandboxes. Use UPI mode.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 bg-brand-700 hover:bg-brand-600 text-white py-3 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-brand-700/15 flex items-center justify-center gap-2"
              >
                {loading ? "Authorizing Gateway..." : `Pay ₹${total.toLocaleString("en-IN")} and Subscribe`}
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Order Summary */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-8">
          <div className="glass-card p-6 rounded-2xl space-y-6">
            <h3 className="text-lg font-bold text-brand-700 pb-4 border-b border-slate-200">Order Summary</h3>

            {/* Admin Seats Subtotal */}
            <div className="flex justify-between items-center text-sm">
              <div>
                <p className="font-bold text-slate-800">Global Admin Seats</p>
                <p className="text-xs text-slate-500">{adminSeats} seat(s) x ₹1,000</p>
              </div>
              <span className="font-bold text-slate-850">₹{adminSubtotal.toLocaleString("en-IN")}</span>
            </div>

            {/* Finance Seats Subtotal */}
            <div className="flex justify-between items-center text-sm">
              <div>
                <p className="font-bold text-slate-800">Finance Ops Seats</p>
                <p className="text-xs text-slate-500">{financeSeats} seat(s) x ₹1,000</p>
              </div>
              <span className="font-bold text-slate-850">₹{financeSubtotal.toLocaleString("en-IN")}</span>
            </div>

            {/* Agent Seats Subtotal */}
            <div className="flex justify-between items-center text-sm">
              <div>
                <p className="font-bold text-slate-800">Sales/Field Agent Seats</p>
                <p className="text-xs text-slate-500">{agentSeats} seat(s) x ₹500</p>
              </div>
              <span className="font-bold text-slate-850">₹{agentSubtotal.toLocaleString("en-IN")}</span>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-700">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Indian GST (18%)</span>
                <span className="font-semibold text-slate-700">₹{gstAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-brand-700 pt-2 border-t border-slate-200">
                <span>Final Pricing</span>
                <span className="text-brand-600">₹{total.toLocaleString("en-IN")} / month</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-brand-50 border border-brand-100 flex gap-3 text-xs text-brand-700 leading-relaxed">
            <CheckCircle className="h-5 w-5 text-brand-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-brand-850 mb-1">Instant Provisioning</p>
              <p>Upon transaction validation, the automated provisioning layer initializes a PostgreSQL database partition for your agency schema immediately.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-6 text-center text-xs text-slate-400">
        <p>Secured by 256-bit SSL encryption. Billed monthly. Terms apply.</p>
      </footer>
    </div>
  );
}
