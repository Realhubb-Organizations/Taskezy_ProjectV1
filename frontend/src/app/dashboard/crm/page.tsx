"use client";

import React, { Suspense } from "react";
import { useApp } from "@/context/AppContext";
import LeadDashboard from "@/components/crm/LeadDashboard";
import AdminCrmDashboard from "@/components/crm/AdminCrmDashboard";

export default function CRMPage() {
  const { currentUser } = useApp();

  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center bg-slate-50 text-xs font-bold text-slate-400">Loading CRM dashboard...</div>}>
      {currentUser?.role === "ADMIN" ? <AdminCrmDashboard /> : <LeadDashboard />}
    </Suspense>
  );
}
