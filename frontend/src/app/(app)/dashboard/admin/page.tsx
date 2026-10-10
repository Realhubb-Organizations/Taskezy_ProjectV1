"use client";

import React, { useState } from "react";
import { useApp, User, Role } from "@/context/AppContext";
import { ShieldCheck, Edit, X, AlertTriangle, Eye, EyeOff, CheckCircle, Plus } from "lucide-react";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { useDialog } from "@/components/ui/DialogProvider";
import DeleteUserModal from "@/components/dashboard/DeleteUserModal";
import FieldError, { fieldErrorClass } from "@/components/ui/FieldError";
import { collectErrors, normalizeIndianMobile, phoneInputProps, sanitizePhoneInput, validateEmail, validatePassword, validatePersonName, validatePhone, validateText } from "@/lib/validation";

export default function AdminPage() {
  const { users, activeRole, updateUserFields, addTeamMember, isDataLoading } = useApp();
  const { toast } = useDialog();

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<{ id: string; name: string } | null>(null);
  
  // Editor form states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [designation, setDesignation] = useState("");
  const [roleType, setRoleType] = useState<"Manager" | "Member">("Member");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [passwordHash, setPasswordHash] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Add User modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addDesignation, setAddDesignation] = useState("Sales Associate");
  const [addDepartment, setAddDepartment] = useState<"SALES" | "TECH" | "MARKETING" | "FINANCE">("SALES");
  const [addRoleType, setAddRoleType] = useState<"Manager" | "Member">("Member");
  const [addRole, setAddRole] = useState<Role>("AGENT");
  const [addPassword, setAddPassword] = useState("");
  const [addShowPassword, setAddShowPassword] = useState(false);
  
  const [successMsg, setSuccessMsg] = useState("");

  // Inline field messages (+ "_form" for a server refusal) and in-flight flags.
  type UserFormErrors = Partial<Record<"firstName" | "lastName" | "email" | "phone" | "designation" | "password" | "_form", string>>;
  const [addErrors, setAddErrors] = useState<UserFormErrors>({});
  const [editErrors, setEditErrors] = useState<UserFormErrors>({});
  const [addSaving, setAddSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const clearAddError = (k: keyof UserFormErrors) => setAddErrors(prev => (prev[k] || prev._form ? { ...prev, [k]: undefined, _form: undefined } : prev));
  const clearEditError = (k: keyof UserFormErrors) => setEditErrors(prev => (prev[k] || prev._form ? { ...prev, [k]: undefined, _form: undefined } : prev));

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setFirstName(user.first_name || user.name.split(" ")[0] || "");
    setLastName(user.last_name || user.name.split(" ")[1] || "");
    setDesignation(user.designation || "");
    setRoleType(user.role_type || "Member");
    setStatus(user.status || "ACTIVE");
    // Blank = keep the current password; it's only reset when one is typed.
    setPasswordHash("");
    setEditErrors({});
    setShowPassword(false);
  };

  const handleEditorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || editSaving) return;
    const errors = collectErrors({
      firstName: validatePersonName(firstName, { label: "First name" }),
      lastName: validatePersonName(lastName, { label: "Last name", required: false, min: 1 }),
      designation: validateText(designation, { label: "Designation", max: 200 }),
      password: passwordHash ? validatePassword(passwordHash, { label: "New password" }) : null
    });
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setEditSaving(true);
    try {
      await updateUserFields(selectedUser.id, firstName.trim(), lastName.trim(), passwordHash, designation.trim(), roleType, status);
      setSuccessMsg(`Successfully updated ${firstName.trim()} ${lastName.trim()}${passwordHash ? " and set a new password" : ""}.`);
      setSelectedUser(null);
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err) {
      setEditErrors({ _form: err instanceof Error ? err.message : "Could not save the changes. Please try again." });
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addSaving) return;
    const errors = collectErrors({
      firstName: validatePersonName(addFirstName, { label: "First name" }),
      lastName: validatePersonName(addLastName, { label: "Last name", required: false, min: 1 }),
      email: validateEmail(addEmail, { required: true }),
      phone: validatePhone(addPhone),
      designation: validateText(addDesignation, { label: "Designation", max: 200 }),
      password: validatePassword(addPassword, { label: "Initial password" })
    });
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setAddSaving(true);
    try {
      await addTeamMember({
        name: `${addFirstName.trim()} ${addLastName.trim()}`.trim(),
        first_name: addFirstName.trim(),
        last_name: addLastName.trim(),
        email: addEmail.trim(),
        company_email: addEmail.trim(),
        // No phone on file rather than a made-up placeholder number.
        phone_number: addPhone.trim() ? normalizeIndianMobile(addPhone) ?? "" : "",
        role: addRole,
        passwordStatus: "ACTIVE",
        password_hash: addPassword,
        tempPassword: addPassword,
        designation: addDesignation.trim(),
        role_type: addRoleType,
        employment_type: "FULL TIME",
        department: addDepartment,
        status: "ACTIVE"
      });
    } catch (err) {
      setAddErrors({ _form: err instanceof Error ? err.message : "Could not create the account. Please try again." });
      setAddSaving(false);
      return;
    }
    setAddSaving(false);
    setSuccessMsg(`Successfully created account for ${addFirstName.trim()} ${addLastName.trim()}.`);
    setIsAddOpen(false);
    setAddErrors({});

    // Reset
    setAddFirstName("");
    setAddLastName("");
    setAddEmail("");
    setAddPhone("");
    setAddDesignation("Sales Associate");
    setAddDepartment("SALES");
    setAddRoleType("Member");
    setAddRole("AGENT");
    setAddPassword("");
    setAddShowPassword(false);

    setTimeout(() => setSuccessMsg(""), 5000);
  };

  // Role Gate Check
  if (activeRole !== "ADMIN") {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-550">
          <AlertTriangle className="h-8 w-8 animate-bounce" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            This module contains root configuration parameters. Access is strictly gated to the Global Administrator role.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
          <ShieldCheck className="h-5.5 w-5.5 text-brand-600" />
          Global Admin Cockpit
        </h2>
        <p className="text-xs text-slate-500">
          Root database credentials manager mapped directly to the <code>taskezy_users</code> and <code>admin_users</code> tables.
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-105 text-xs text-emerald-700 font-bold flex items-center gap-2 shadow-sm animate-fade-in">
          <CheckCircle className="h-4.5 w-4.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Roster Table */}
      <div className="glass-card p-6 sm:p-8 rounded-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-700">Corporate Accounts &amp; Roster</h3>
          <button
            onClick={() => { setAddErrors({}); setIsAddOpen(true); }}
            className="inline-flex items-center gap-1.5 bg-[#0B1E6E] hover:bg-[#081650] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Account
          </button>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="p-4">Emp ID</th>
                  <th className="p-4">Name</th>
                  <th className="p-4">Contact Info</th>
                  <th className="p-4">Department / Designation</th>
                  <th className="p-4">Role Type</th>
                  <th className="p-4">Password Hash</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isDataLoading && users.length === 0 ? (
                  <TableRowsSkeleton rows={6} columns={8} />
                ) : (
                  users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-mono text-[10px] text-slate-500 font-semibold">
                      {user.employee_code || `TE-USR-${user.id.slice(-4).toUpperCase()}`}
                    </td>
                    <td className="p-4 font-bold text-slate-700">
                      {user.first_name || user.name.split(" ")[0]} {user.last_name || user.name.split(" ")[1] || ""}
                    </td>
                    <td className="p-4 text-slate-500 space-y-0.5">
                      <p className="font-semibold text-slate-700">{user.email}</p>
                      <p className="font-mono text-[10px] text-slate-450">{user.phone_number ? `+91-${user.phone_number}` : "—"}</p>
                    </td>
                    <td className="p-4 text-slate-500 space-y-0.5">
                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-100 border border-slate-200 text-slate-600">
                        {user.department || user.role}
                      </span>
                      <p className="text-[11px] font-medium text-slate-600 mt-1">{user.designation || "Global Administrator"}</p>
                    </td>
                    <td className="p-4 text-slate-500 font-semibold">
                      {user.role_type || (user.role === "ADMIN" ? "Manager" : "Member")}
                    </td>
                    {/* Passwords are never readable (only a hash is stored server-side). */}
                    <td className="p-4 font-mono text-slate-400 font-black" title="Passwords are hidden; set a new one with Edit">
                      ••••••••
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-block border px-2 py-0.5 rounded text-[10px] font-bold ${
                          (user.status || "ACTIVE") === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-red-50 text-red-700 border-red-100"
                        }`}
                      >
                        {user.status || "ACTIVE"}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-3">
                      {user.role !== "ADMIN" ? (
                        <>
                          <button
                            onClick={() => handleEditClick(user)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingUser({ id: user.id, name: user.name })}
                            className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-400 text-[10px] font-medium">Root Protected</span>
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

      {/* Add Account Modal */}
      {isAddOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={() => setIsAddOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-brand-700 flex items-center gap-1.5">
                <Plus className="h-4.5 w-4.5 text-brand-600" />
                Create Roster Account
              </h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">First Name</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={addFirstName}
                    onChange={(e) => { setAddFirstName(e.target.value); clearAddError("firstName"); }}
                    aria-invalid={!!addErrors.firstName}
                    placeholder="Sanjeev"
                    className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!addErrors.firstName)}`}
                  />
                  <FieldError message={addErrors.firstName} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Last Name</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={addLastName}
                    onChange={(e) => { setAddLastName(e.target.value); clearAddError("lastName"); }}
                    aria-invalid={!!addErrors.lastName}
                    placeholder="Singh"
                    className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!addErrors.lastName)}`}
                  />
                  <FieldError message={addErrors.lastName} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Corporate Email</label>
                  <input
                    type="email"
                    maxLength={254}
                    autoComplete="off"
                    value={addEmail}
                    onChange={(e) => { setAddEmail(e.target.value); clearAddError("email"); }}
                    aria-invalid={!!addErrors.email}
                    placeholder="name@realhubb.in"
                    className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!addErrors.email)}`}
                  />
                  <FieldError message={addErrors.email} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Phone Number</label>
                  <input
                    {...phoneInputProps}
                    autoComplete="off"
                    value={addPhone}
                    onChange={(e) => { setAddPhone(sanitizePhoneInput(e.target.value)); clearAddError("phone"); }}
                    aria-invalid={!!addErrors.phone}
                    placeholder="9980189914"
                    className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!addErrors.phone)}`}
                  />
                  <FieldError message={addErrors.phone} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Department</label>
                  <select
                    value={addDepartment}
                    onChange={(e) => setAddDepartment(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="SALES">SALES</option>
                    <option value="TECH">IT / TECH</option>
                    <option value="MARKETING">MARKETING</option>
                    <option value="FINANCE">FINANCE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Designation</label>
                  <input
                    type="text"
                    maxLength={200}
                    value={addDesignation}
                    onChange={(e) => { setAddDesignation(e.target.value); clearAddError("designation"); }}
                    aria-invalid={!!addErrors.designation}
                    placeholder="e.g. Sales Associate"
                    className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!addErrors.designation)}`}
                  />
                  <FieldError message={addErrors.designation} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Role Type</label>
                  <select
                    value={addRoleType}
                    onChange={(e) => setAddRoleType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="Member">Member</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">SaaS License Type</label>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="AGENT">AGENT (Sales/IT/Mktg)</option>
                    <option value="FINANCE">FINANCE OPS</option>
                    <option value="ADMIN">GLOBAL ADMIN</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Initial Password</label>
                <div className="relative">
                  <input
                    type={addShowPassword ? "text" : "password"}
                    maxLength={128}
                    autoComplete="new-password"
                    value={addPassword}
                    onChange={(e) => { setAddPassword(e.target.value); clearAddError("password"); }}
                    aria-invalid={!!addErrors.password}
                    placeholder="At least 8 characters"
                    className={`w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 text-xs focus:outline-none focus:border-brand-500 ${fieldErrorClass(!!addErrors.password)}`}
                  />
                  <button
                    type="button"
                    onClick={() => setAddShowPassword(!addShowPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {addShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FieldError message={addErrors.password} />
              </div>

              <FieldError message={addErrors._form} />
              <button
                type="submit"
                disabled={addSaving}
                className="w-full bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-sm disabled:opacity-60"
              >
                {addSaving ? "Provisioning..." : "Provision Account"}
              </button>
            </form>
          </div>
        </>
      )}

      {/* Editor Modal Dialog */}
      {selectedUser && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={() => setSelectedUser(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-brand-700 flex items-center gap-1.5">
                <Edit className="h-4.5 w-4.5 text-brand-600" />
                Edit Account Attributes
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-655">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
              Updating details for <strong>{selectedUser.email}</strong>. Changes commit instantly to the simulated SQL database partition.
            </p>

            <form onSubmit={handleEditorSubmit} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">First Name</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); clearEditError("firstName"); }}
                    aria-invalid={!!editErrors.firstName}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-805 focus:outline-none focus:border-brand-500 ${fieldErrorClass(!!editErrors.firstName)}`}
                  />
                  <FieldError message={editErrors.firstName} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Last Name</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); clearEditError("lastName"); }}
                    aria-invalid={!!editErrors.lastName}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-805 focus:outline-none focus:border-brand-500 ${fieldErrorClass(!!editErrors.lastName)}`}
                  />
                  <FieldError message={editErrors.lastName} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Designation</label>
                <input
                  type="text"
                  maxLength={200}
                  value={designation}
                  onChange={(e) => { setDesignation(e.target.value); clearEditError("designation"); }}
                  aria-invalid={!!editErrors.designation}
                  className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-805 focus:outline-none ${fieldErrorClass(!!editErrors.designation)}`}
                />
                <FieldError message={editErrors.designation} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Role Type</label>
                  <select
                    value={roleType}
                    onChange={(e) => setRoleType(e.target.value as "Manager" | "Member")}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="Manager">Manager</option>
                    <option value="Member">Member</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="Leave blank to keep the current password"
                    value={passwordHash}
                    onChange={(e) => { setPasswordHash(e.target.value); clearEditError("password"); }}
                    aria-invalid={!!editErrors.password}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 py-2 text-xs text-slate-805 focus:outline-none focus:border-brand-500 ${fieldErrorClass(!!editErrors.password)}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-655"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FieldError message={editErrors.password} />
              </div>

              <FieldError message={editErrors._form} />
              <button
                type="submit"
                disabled={editSaving}
                className="w-full bg-[#0B1E6E] hover:bg-[#081650] text-white font-semibold py-2.5 rounded-lg text-xs transition-all shadow-md disabled:opacity-60"
              >
                {editSaving ? "Saving..." : <>Apply Changes &amp; Synchronize</>}
              </button>
            </form>
          </div>
        </>
      )}

      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onDeleted={(message) => {
            setDeletingUser(null);
            toast(message, "success");
          }}
        />
      )}
    </div>
  );
}
