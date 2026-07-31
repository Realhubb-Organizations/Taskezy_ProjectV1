import React from "react";
import { Users, CheckCircle, Clock, Calendar, ShieldAlert } from "lucide-react";
import SubActionsMenu, { ActionItem } from "./SubActionsMenu";
import { useRouter } from "next/navigation";
import { User, TimesheetLog } from "@/context/AppContext";

interface AttendanceWidgetProps {
  users: User[];
  timesheets: TimesheetLog[];
}

export default function AttendanceWidget({ users, timesheets }: AttendanceWidgetProps) {
  const router = useRouter();

  const handleWidgetRedirect = () => {
    router.push("/dashboard/hrms?tab=attendance");
  };

  const getSubActions = (): ActionItem[] => [
    { label: "View Attendance Roster", href: "/dashboard/hrms?tab=attendance" },
    { label: "View Roster Directory", href: "/dashboard/hrms?tab=teams" },
    { label: "Trigger Geofence Check", onClick: () => alert("Testing geofencing audit checks...") }
  ];

  const employeeList = users.filter(u => u.role !== "ADMIN");
  const totalEmployeesCount = employeeList.length;

  const todayStr = new Date().toISOString().split("T")[0];
  const presentEmployees = employeeList.filter(emp =>
    timesheets.some(ts => ts.userId === emp.id && ts.date === todayStr)
  );
  const presentCount = presentEmployees.length;

  // SVG Circular progress configurations
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = totalEmployeesCount > 0 
    ? circumference - (presentCount / totalEmployeesCount) * circumference 
    : circumference;

  return (
    <div
      onClick={handleWidgetRedirect}
      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative h-full animate-fade-in"
    >
      <div className="flex justify-between items-start border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-700 flex items-center gap-2">
            <Clock className="h-4.5 w-4.5 text-indigo-600" />
            HRMS Attendance Today
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Device geofencing and active punch-in status tracker.</p>
        </div>
        <SubActionsMenu actions={getSubActions()} />
      </div>

      {/* Top Portion: Circular Progress & Ratio */}
      <div className="flex items-center gap-6 mt-4 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
        <div className="relative flex items-center justify-center shrink-0">
          <svg className="w-14 h-14 transform -rotate-90">
            <circle
              className="text-slate-100"
              strokeWidth="5.5"
              stroke="currentColor"
              fill="transparent"
              r={radius}
              cx="28"
              cy="28"
            />
            <circle
              className="text-indigo-600 transition-all duration-500"
              strokeWidth="5.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r={radius}
              cx="28"
              cy="28"
            />
          </svg>
          <div className="absolute text-[10px] font-black text-slate-805">
            {presentCount}/{totalEmployeesCount}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-bold text-slate-800">
            {totalEmployeesCount > 0 ? Math.round((presentCount / totalEmployeesCount) * 100) : 0}% Roster Active
          </p>
          <p className="text-[9px] text-slate-500 font-semibold leading-relaxed">
            {presentCount} employees present today. {totalEmployeesCount - presentCount} employees absent or pending clock-in.
          </p>
        </div>
      </div>

      {/* Bottom Portion: Employee Roster Grid */}
      <div className="mt-5 space-y-2">
        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Today&apos;s Presence Grid</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-40 overflow-y-auto pr-1">
          {employeeList.map((emp) => {
            const hasCheckedIn = timesheets.some(ts => ts.userId === emp.id && ts.date === todayStr);
            return (
              <div
                key={emp.id}
                className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${
                  hasCheckedIn
                    ? "bg-emerald-50/50 border-emerald-200 text-emerald-800"
                    : "bg-slate-50 border-slate-200/80 text-slate-500"
                }`}
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${
                  hasCheckedIn ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                }`} />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold truncate leading-none">{emp.name}</p>
                  <p className="text-[8px] opacity-75 font-semibold mt-0.5 truncate leading-none">{emp.designation}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
