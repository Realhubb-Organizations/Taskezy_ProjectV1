"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { CalendarEventType } from "@/context/AppContext";

interface TypeOption {
  value: CalendarEventType;
  label: string;
}

interface AddCalendarEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { type: CalendarEventType; title: string; date: string; time?: string; description?: string; amount?: number }) => void;
  typeOptions: TypeOption[];
  heading: string;
  showAmount?: boolean;
}

export default function AddCalendarEventModal({
  isOpen,
  onClose,
  onSubmit,
  typeOptions,
  heading,
  showAmount
}: AddCalendarEventModalProps) {
  const [type, setType] = useState<CalendarEventType>(typeOptions[0]?.value);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) {
      alert("Title and date are required.");
      return;
    }
    onSubmit({
      type,
      title,
      date,
      time: time || undefined,
      description: description || undefined,
      amount: showAmount && amount ? Number(amount) : undefined
    });
    setTitle("");
    setDate("");
    setTime("");
    setDescription("");
    setAmount("");
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
          <h3 className="text-sm font-bold text-brand-700">{heading}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-655">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {typeOptions.length > 1 && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CalendarEventType)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
              >
                {typeOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. All-Hands Town Hall"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Time (optional)</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
              />
            </div>
          </div>

          {showAmount && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Amount (INR, optional)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 50000"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-brand-700 hover:bg-brand-600 text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-sm"
          >
            Save
          </button>
        </form>
      </div>
    </>
  );
}
