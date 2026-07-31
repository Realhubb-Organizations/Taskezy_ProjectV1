"use client";

import React, { useState } from "react";
import { useApp, AttendanceRecord, TimesheetLog, CalendarEventType } from "@/context/AppContext";
import { useSearchParams } from "next/navigation";
import MonthCalendar from "@/components/calendar/MonthCalendar";
import AddCalendarEventModal from "@/components/calendar/AddCalendarEventModal";
import {
  Users,
  Clock,
  LayoutDashboard,
  Plus,
  X,
  FileText,
  AlertTriangle,
  Briefcase,
  DollarSign,
  Gift,
  Search,
  Filter,
  CheckCircle,
  MapPin,
  ShieldCheck,
  CalendarDays
} from "lucide-react";

export default function HRMSPage() {
  const {
    users,
    attendanceRecords,
    activeRole,
    currentUser,
    timesheets,
    punchIn,
    punchOut,
    submitRegularization,
    approveRegularization,
    rejectRegularization,
    calendarEvents,
    addCalendarEvent
  } = useApp();

  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get("tab") || "dashboard";

  // Form modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("TeamLead");
  const [salary, setSalary] = useState("₹80,000");

  // Punch Card state
  const [punchLoc, setPunchLoc] = useState<"office" | "offsite">("office");
  const [punchStatusMsg, setPunchStatusMsg] = useState("");
  const [punchErrorMsg, setPunchErrorMsg] = useState("");

  // Regularization modal state
  const [selectedLog, setSelectedLog] = useState<TimesheetLog | null>(null);
  const [reqIn, setReqIn] = useState("09:00");
  const [reqOut, setReqOut] = useState("18:00");
  const [regReason, setRegReason] = useState("");
  
  const [successMsg, setSuccessMsg] = useState("");

  // Calendar tab state
  const todayStr0 = new Date().toISOString().split("T")[0];
  const [selectedCalDate, setSelectedCalDate] = useState<string>(todayStr0);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const hrmsEvents = calendarEvents.filter(e => e.system === "HRMS");
  const dayHrmsEvents = hrmsEvents.filter(e => e.date === selectedCalDate);

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      alert("Name and email are required.");
      return;
    }
    setSuccessMsg(`Successfully invited and provisioned account for ${name}.`);
    setName("");
    setEmail("");
    setIsAddOpen(false);
    setTimeout(() => setSuccessMsg(""), 5000);
  };

  // Check if current user is admin
  const isAdmin = currentUser?.role === "ADMIN" || activeRole === "ADMIN";

  // Filter timesheets for personal view (non-admin)
  const myLogs = timesheets.filter(ts => ts.userId === currentUser?.id);

  // Check if currently punched in today
  const todayStr = new Date().toISOString().split("T")[0];
  const activePunch = myLogs.find(ts => ts.date === todayStr && !ts.punchOut);

  const handlePunch = () => {
    setPunchStatusMsg("");
    setPunchErrorMsg("");

    if (activePunch) {
      // Punch Out
      const res = punchOut();
      if (res.success) {
        setPunchStatusMsg("Successfully punched out for the day.");
      } else {
        setPunchErrorMsg(res.error || "Punch out failed.");
      }
    } else {
      // Punch In
      // Office: Mumbai Corporate Center (19.0760, 72.8777)
      // Offsite: Bangalore Outer Ring Road (12.9716, 77.5946)
      const lat = punchLoc === "office" ? 19.0760 : 12.9716;
      const lng = punchLoc === "office" ? 72.8777 : 77.5946;

      const res = punchIn(lat, lng);
      if (res.success) {
        setPunchStatusMsg("Successfully punched in! Geofenced telemetry checked.");
      } else {
        setPunchErrorMsg(res.error || "Punch In failed.");
      }
    }
    setTimeout(() => {
      setPunchStatusMsg("");
      setPunchErrorMsg("");
    }, 6000);
  };

  const handleRegSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLog) return;
    submitRegularization(selectedLog.id, reqIn, reqOut, regReason);
    setSuccessMsg("Regularization request submitted to HR audit queue.");
    setSelectedLog(null);
    setRegReason("");
    setTimeout(() => setSuccessMsg(""), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <Briefcase className="h-5.5 w-5.5 text-brand-600" />
            HRIS Portal
          </h2>
          <p className="text-xs text-slate-500">
            {isAdmin ? (
              <span>Corporate Roster Audit Console • Real-time geofenced attendance telemetry &amp; payroll.</span>
            ) : (
              <span>My Attendance Workspace • Clock in/out and view timesheet logs.</span>
            )}
          </p>
        </div>

        {isAdmin && activeTabParam === "teams" && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-700/10"
          >
            <Plus className="h-4 w-4" />
            Add Team Member
          </button>
        )}

        {isAdmin && activeTabParam === "calendar" && (
          <button
            onClick={() => setIsAddEventOpen(true)}
            className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-700/10"
          >
            <Plus className="h-4 w-4" />
            Add Event
          </button>
        )}
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 rounded-lg font-bold">
          {successMsg}
        </div>
      )}

      {/* 1. Teams tab view */}
      {activeTabParam === "teams" && (
        <div className="glass-card p-6 rounded-2xl space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="text-slate-400 block font-semibold mb-0.5">Team Leads / Managers</span>
              <span className="text-lg font-black text-slate-800">
                {users.filter(u => u.role_type === "Manager" && u.role !== "ADMIN").length}
              </span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="text-slate-400 block font-semibold mb-0.5">Agents / Members</span>
              <span className="text-lg font-black text-slate-800">
                {users.filter(u => u.role_type === "Member" && u.role !== "ADMIN").length}
              </span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="text-slate-400 block font-semibold mb-0.5">Unassigned</span>
              <span className="text-lg font-black text-slate-800">0</span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="text-slate-400 block font-semibold mb-0.5">Active Members</span>
              <span className="text-lg font-black text-brand-700">
                {users.length}
              </span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="p-4">Name</th>
                    <th className="p-4">Corporate Email</th>
                    <th className="p-4">Department / Designation</th>
                    <th className="p-4">Type</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold text-slate-805">{u.name}</td>
                      <td className="p-4 text-slate-500 font-mono">{u.email}</td>
                      <td className="p-4 text-slate-550">
                        <span className="font-bold text-slate-700 block">{u.department}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{u.designation}</span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          u.role_type === "Manager" ? "bg-brand-50 text-brand-700 border border-brand-100" : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}>
                          {u.role_type || "Member"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {u.role !== "ADMIN" ? (
                          <button className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-700 rounded font-semibold text-[10px] transition-colors">
                            Pause Allocation
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic font-semibold">Root Admin</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Attendance tab view */}
      {activeTabParam === "attendance" && (
        <div className="space-y-6 animate-fade-in">
          {/* USER SPECIFIC PUNCH STATION (Hidden for Admin) */}
          {!isAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Punch Station Card */}
              <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Clock className="h-4.5 w-4.5 text-brand-600" />
                    GPS Punch Clock Station
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Your location coordinates are checked against geofence perimeters.
                  </p>
                </div>

                {punchStatusMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-700 font-bold rounded-lg">
                    {punchStatusMsg}
                  </div>
                )}
                {punchErrorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 text-[10px] text-red-700 font-bold rounded-lg flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{punchErrorMsg}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-[9px] uppercase font-bold text-slate-400">Select Worksite</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPunchLoc("office")}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border text-center transition-all ${
                        punchLoc === "office" ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-slate-50 border-slate-200 text-slate-500"
                      }`}
                    >
                      Corporate HQ (In-HQ)
                    </button>
                    <button
                      onClick={() => setPunchLoc("offsite")}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border text-center transition-all ${
                        punchLoc === "offsite" ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-slate-50 border-slate-200 text-slate-500"
                      }`}
                    >
                      Off-Site (Bangalore)
                    </button>
                  </div>
                </div>

                <button
                  onClick={handlePunch}
                  className={`w-full py-3 rounded-xl text-xs font-bold text-white transition-all shadow-md ${
                    activePunch
                      ? "bg-red-650 hover:bg-red-600 shadow-red-200"
                      : "bg-brand-700 hover:bg-brand-600 shadow-brand-200"
                  }`}
                >
                  {activePunch ? "Clock Out / End Shift" : "Clock In / Punch Attendance"}
                </button>
              </div>

              {/* Personal Logs Table */}
              <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h4 className="text-xs font-bold text-slate-705">My Timesheet History (Current Month)</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-405 tracking-wider">
                          <th className="p-3">Date</th>
                          <th className="p-3">Punch In</th>
                          <th className="p-3">Punch Out</th>
                          <th className="p-3">Duration</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {myLogs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-slate-400 font-semibold italic">
                              No attendance punches recorded yet. Use the punch clock.
                            </td>
                          </tr>
                        ) : (
                          myLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50/50">
                              <td className="p-3 font-mono font-semibold">{log.date}</td>
                              <td className="p-3 font-mono text-slate-500">
                                {log.punchIn ? new Date(log.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                              </td>
                              <td className="p-3 font-mono text-slate-500">
                                {log.punchOut ? new Date(log.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                              </td>
                              <td className="p-3 font-mono">
                                {log.durationHours ? `${log.durationHours} hrs` : "In Progress"}
                              </td>
                              <td className="p-3">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  log.status === "Regularized"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                    : log.status === "Regularization Pending"
                                    ? "bg-amber-50 text-amber-700 border border-amber-100 animate-pulse"
                                    : "bg-slate-100 text-slate-600 border border-slate-200"
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                {log.status !== "Regularized" && log.status !== "Regularization Pending" && (
                                  <button
                                    onClick={() => setSelectedLog(log)}
                                    className="text-[10px] text-brand-700 hover:underline font-bold"
                                  >
                                    Request correction
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ADMIN AUDIT & APPROVAL PANEL (Only shown for Admin) */}
          {isAdmin && (
            <div className="space-y-6">
              {/* Regularization Approvals */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <ShieldCheck className="h-4.5 w-4.5 text-brand-700" />
                    Pending Attendance Corrections (Regularization Audit Queue)
                  </h3>
                  <span className="text-[9px] bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded font-black">
                    Audit Verification Required
                  </span>
                </div>

                <div className="space-y-3">
                  {timesheets.filter(ts => ts.status === "Regularization Pending").length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      No pending timesheet regularization requests from team members.
                    </div>
                  ) : (
                    timesheets.filter(ts => ts.status === "Regularization Pending").map((ts) => (
                      <div key={ts.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-xs">
                        <div>
                          <p className="font-bold text-slate-800">{ts.userName}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Date: {ts.date}</p>
                          <div className="flex gap-2 mt-2">
                            <span className="bg-amber-50 border border-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[9px] font-bold">
                              Requested Shift: {ts.regularizationRequest?.requestedIn.slice(-13, -8) || "09:00"} to {ts.regularizationRequest?.requestedOut.slice(-13, -8) || "18:00"}
                            </span>
                            <span className="bg-slate-200 border border-slate-250 text-slate-700 px-1.5 py-0.5 rounded text-[9px] font-bold">
                              Reason: {ts.regularizationRequest?.reason || "Forgot to punch out"}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => approveRegularization(ts.id)}
                            className="px-3 py-1.5 rounded bg-emerald-650 text-white hover:bg-emerald-600 text-[10px] font-bold"
                          >
                            Approve Correction
                          </button>
                          <button
                            onClick={() => rejectRegularization(ts.id)}
                            className="px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Global Attendance Telemetry Table */}
              <div className="glass-card p-6 rounded-2xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-bold text-slate-700">Departmental Roster Attendance Records</h3>
                  <div className="flex gap-2 text-xs">
                    <input type="text" readOnly value="01-07-2026" className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] focus:outline-none" />
                    <input type="text" readOnly value="31-07-2026" className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] focus:outline-none" />
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                          <th className="p-4">Employee</th>
                          <th className="p-4">Designation</th>
                          <th className="p-4">Present Days</th>
                          <th className="p-4">On Time</th>
                          <th className="p-4 text-right">Late</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {attendanceRecords.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-4">
                              <p className="font-bold text-slate-800">{item.employeeName}</p>
                              <p className="text-[10px] text-slate-455 font-mono mt-0.5">{item.email}</p>
                            </td>
                            <td className="p-4 text-slate-500 font-medium">{item.designation}</td>
                            <td className="p-4 text-slate-705 font-mono">{item.presentDays} / {item.totalDays} days</td>
                            <td className="p-4 text-emerald-650">{item.onTime}</td>
                            <td className="p-4 text-right text-red-655">{item.late}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HRMS Calendar tab view */}
      {activeTabParam === "calendar" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Holiday", color: "bg-rose-500" },
              { label: "Absence", color: "bg-amber-500" },
              { label: "Team Event", color: "bg-indigo-500" }
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                <span className={`h-2 w-2 rounded-full ${item.color}`} />
                {item.label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8">
              <MonthCalendar
                events={hrmsEvents}
                selectedDate={selectedCalDate}
                onSelectDate={setSelectedCalDate}
                colorForEvent={(e) =>
                  e.type === "HOLIDAY" ? "bg-rose-500" : e.type === "ABSENCE" ? "bg-amber-500" : "bg-indigo-500"
                }
              />
            </div>

            <div className="lg:col-span-4 glass-card p-5 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-2">
                {new Date(selectedCalDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </h3>
              {dayHrmsEvents.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic py-4 text-center">No holidays, absences, or events on this date.</p>
              ) : (
                <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
                  {dayHrmsEvents.map(e => (
                    <div key={e.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-800">{e.title}</p>
                        <span
                          className={`text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            e.type === "HOLIDAY"
                              ? "bg-rose-50 text-rose-700 border border-rose-100"
                              : e.type === "ABSENCE"
                              ? "bg-amber-50 text-amber-700 border border-amber-100"
                              : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                          }`}
                        >
                          {e.type === "ADMIN_EVENT" ? "EVENT" : e.type}
                        </span>
                      </div>
                      {e.time && <p className="text-[10px] text-slate-500 font-mono mt-1">{e.time}</p>}
                      {e.description && <p className="text-[10px] text-slate-500 mt-1">{e.description}</p>}
                      {e.type === "ABSENCE" && e.employeeNames && e.employeeNames.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {e.employeeNames.map((name, i) => (
                            <span key={i} className="text-[9px] font-bold bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                      {e.createdBy && <p className="text-[9px] text-slate-400 mt-1.5">Scheduled by {e.createdBy}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. HR Dashboard tab view */}
      {activeTabParam === "dashboard" && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary counters */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Employees</span>
              <p className="text-xl font-black text-slate-800">14</p>
              <span className="text-[9px] text-slate-450">Active team members</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Present Today</span>
              <p className="text-xl font-black text-slate-850">
                {timesheets.filter(ts => ts.date === todayStr).length}
              </p>
              <span className="text-[9px] text-slate-455">
                Attendance rate: {Math.round((timesheets.filter(ts => ts.date === todayStr).length / 14) * 100)}%
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Celebrations</span>
              <p className="text-xl font-black text-slate-850">0</p>
              <span className="text-[9px] text-slate-450">0 Birthdays / Anniversaries</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Payrolls</span>
              <p className="text-xl font-black text-slate-850">0</p>
              <span className="text-[9px] text-slate-450">To be processed</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Salaries Paid</span>
              <p className="text-xl font-black text-brand-700">₹0</p>
              <span className="text-[9px] text-slate-455">This month total</span>
            </div>
          </div>

          {/* Quick options */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-6 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold text-slate-700">Attendance Telemetry</h3>
              <p className="text-[11px] text-slate-550 leading-relaxed">
                Clicking the Clock-in punch Station logs precision device geofencing values. You can view logs inside the Attendance sheet or request modifications.
              </p>
            </div>

            <div className="glass-card p-6 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold text-slate-700">Departmental Payroll</h3>
              <p className="text-[11px] text-slate-550 leading-relaxed">
                Salaries are closed dynamically on the 1st of every month. Unapproved leaves or regularization penalties will calculate proportional salary slip deductions automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Regularization Request Modal */}
      {selectedLog && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-35" onClick={() => setSelectedLog(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold text-brand-700 flex items-center gap-1">
                <Clock className="h-4.5 w-4.5 text-brand-600" />
                Request Attendance Correction
              </h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-655">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
              Submit check-in/out regularization request for <strong>{selectedLog.date}</strong>. This request goes into the HR audit queue.
            </p>

            <form onSubmit={handleRegSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Check-In Time</label>
                  <input
                    type="text"
                    required
                    value={reqIn}
                    onChange={(e) => setReqIn(e.target.value)}
                    placeholder="09:00"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Check-Out Time</label>
                  <input
                    type="text"
                    required
                    value={reqOut}
                    onChange={(e) => setReqOut(e.target.value)}
                    placeholder="18:00"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Reason for request</label>
                <textarea
                  required
                  value={regReason}
                  onChange={(e) => setRegReason(e.target.value)}
                  placeholder="e.g. GPS coordinates validation error / Forgot to punch out"
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-700 hover:bg-brand-600 text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-sm"
              >
                Submit Correction Request
              </button>
            </form>
          </div>
        </>
      )}

      {/* Add Team Member Modal */}
      {isAddOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={() => setIsAddOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-brand-700">Add Team Member</h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-655">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Gautham Karanam"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Corporate Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="gautham@realhubb.in"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">HR Designation</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option>TeamLead</option>
                    <option>Sales Executive</option>
                    <option>General Manager</option>
                    <option>Director Sales</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Monthly Salary</label>
                  <input
                    type="text"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="₹80,000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-brand-700 hover:bg-brand-600 text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-sm"
              >
                Provision Team Account
              </button>
            </form>
          </div>
        </>
      )}

      {/* Add HRMS Calendar Event Modal */}
      <AddCalendarEventModal
        isOpen={isAddEventOpen}
        onClose={() => setIsAddEventOpen(false)}
        heading="Add HRMS Calendar Event"
        typeOptions={[
          { value: "ADMIN_EVENT" as CalendarEventType, label: "Team Event" },
          { value: "HOLIDAY" as CalendarEventType, label: "Company Holiday" }
        ]}
        onSubmit={(data) => {
          addCalendarEvent({
            system: "HRMS",
            type: data.type,
            title: data.title,
            date: data.date,
            time: data.time,
            description: data.description,
            createdBy: currentUser?.name
          });
          setIsAddEventOpen(false);
          setSuccessMsg("Event added to the company HRMS calendar for all members.");
          setTimeout(() => setSuccessMsg(""), 5000);
        }}
      />
    </div>
  );
}
