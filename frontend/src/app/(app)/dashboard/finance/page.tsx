"use client";

import React, { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import OverviewTab from "@/components/finance/OverviewTab";
import BookingsTab from "@/components/finance/BookingsTab";
import BookingDetails from "@/components/finance/BookingDetails";
import PaymentsTab from "@/components/finance/PaymentsTab";
import PaymentDetails from "@/components/finance/PaymentDetails";
import BookingApprovalTab from "@/components/finance/BookingApprovalTab";
import { AddBookingModal } from "@/components/finance/BookingModals";
import { AddPaymentModal } from "@/components/finance/PaymentModals";
import { EMPTY_FILTERS, FilterState, useLookups } from "@/components/finance/stShared";

// Finance → Sales Tracker. Bookings of Booked leads, the brokerage on each
// (Basic / NRI / AOP), and that brokerage split into invoices/payments.
// Open only to the accounts in lib/salesTracker.ts (layout.tsx's
// checkUserAccess gates the page; the API enforces the same list).
//
// URL: ?tab=bookings|payments (Overview when absent); ?booking=<id> opens a
// booking's details page under Bookings.

type TrackerTab = "overview" | "bookings" | "payments" | "approval";

const TABS: { key: TrackerTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "bookings", label: "Bookings" },
  { key: "payments", label: "Payments & Invoices" },
  { key: "approval", label: "Booking Approval" }
];

export default function SalesTrackerPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { manualRefreshSignal } = useApp();
  const { toast } = useDialog();
  const lookups = useLookups();

  const bookingId = searchParams.get("booking");
  // ?payment=<id>&pb=<its booking id> opens a payment's details under Payments & Invoices.
  const paymentId = searchParams.get("payment");
  const paymentBookingId = searchParams.get("pb");
  const tabParam = searchParams.get("tab");
  const activeTab: TrackerTab = bookingId ? "bookings" : paymentId ? "payments" : TABS.some(t => t.key === tabParam) ? (tabParam as TrackerTab) : "overview";

  const go = (query: string) => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  const setTab = (tab: TrackerTab) => go(tab === "overview" ? "" : `tab=${tab}`);
  const openBooking = (id: string) => go(`tab=bookings&booking=${id}`);
  const openPayment = (id: string, bookingOfPayment: string) => go(`tab=payments&payment=${id}&pb=${bookingOfPayment}`);

  // Each tab keeps its own filters while you switch between them.
  const [filters, setFilters] = useState<Record<TrackerTab, FilterState>>({
    overview: EMPTY_FILTERS,
    bookings: EMPTY_FILTERS,
    payments: EMPTY_FILTERS,
    approval: EMPTY_FILTERS
  });
  const setTabFilters = (tab: TrackerTab) => (f: FilterState) => setFilters(prev => ({ ...prev, [tab]: f }));

  // Bumped after any save so every list (and the Overview totals) reload.
  const [dataVersion, setDataVersion] = useState(0);
  const refreshSignal = manualRefreshSignal + dataVersion;
  const onDataChanged = () => setDataVersion(v => v + 1);

  const [adding, setAdding] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  // The tab row's main button: Create Payment on Payments & Invoices, Add Booking elsewhere.
  const onPayments = activeTab === "payments";

  return (
    <div className="space-y-4 pb-8 animate-fade-in text-slate-800">
      <div className="flex items-end justify-between gap-3">
        <nav className="flex gap-6 overflow-x-auto" aria-label="Sales Tracker sections">
          {TABS.map(t => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`pb-2 border-b-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                  active ? "border-[#0B1E6E] text-[#0B1E6E]" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
        {/* Not on a booking's own details page, nor on Booking Approval (design). */}
        {!bookingId && activeTab !== "approval" && (
          <button
            type="button"
            onClick={() => (onPayments ? setCreatingPayment(true) : setAdding(true))}
            className="ui-btn ui-btn-primary shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{onPayments ? "Create Payment" : "Add Booking"}</span>
            <span className="sm:hidden">{onPayments ? "Payment" : "Add"}</span>
          </button>
        )}
      </div>

      {activeTab === "overview" && (
        <OverviewTab
          filters={filters.overview}
          onFiltersChange={setTabFilters("overview")}
          lookups={lookups}
          refreshSignal={refreshSignal}
          onExplore={openBooking}
        />
      )}
      {activeTab === "bookings" && (bookingId ? (
        <BookingDetails
          bookingId={bookingId}
          lookups={lookups}
          refreshSignal={refreshSignal}
          onBack={() => setTab("bookings")}
          onDataChanged={onDataChanged}
        />
      ) : (
        <BookingsTab
          filters={filters.bookings}
          onFiltersChange={setTabFilters("bookings")}
          lookups={lookups}
          refreshSignal={refreshSignal}
          onExplore={openBooking}
        />
      ))}
      {activeTab === "payments" && paymentId && paymentBookingId && (
        <PaymentDetails
          paymentId={paymentId}
          bookingId={paymentBookingId}
          refreshSignal={refreshSignal}
          onBack={() => setTab("payments")}
          onDataChanged={onDataChanged}
        />
      )}
      {activeTab === "payments" && !(paymentId && paymentBookingId) && (
        <PaymentsTab
          filters={filters.payments}
          onFiltersChange={setTabFilters("payments")}
          lookups={lookups}
          refreshSignal={refreshSignal}
          onDataChanged={onDataChanged}
          onOpenPayment={(p) => openPayment(p.payment_id, p.booking_id)}
        />
      )}

      {activeTab === "approval" && (
        <BookingApprovalTab
          filters={filters.approval}
          onFiltersChange={setTabFilters("approval")}
          lookups={lookups}
          refreshSignal={refreshSignal}
          onDataChanged={onDataChanged}
        />
      )}

      {creatingPayment && (
        <AddPaymentModal
          onClose={() => setCreatingPayment(false)}
          onSaved={() => {
            setCreatingPayment(false);
            toast("Payment created.", "success");
            onDataChanged();
          }}
        />
      )}

      {adding && (
        <AddBookingModal
          lookups={lookups}
          onClose={() => setAdding(false)}
          onSaved={(created) => {
            setAdding(false);
            toast("Booking added.", "success");
            onDataChanged();
            openBooking(created.booking_id);
          }}
        />
      )}
    </div>
  );
}
