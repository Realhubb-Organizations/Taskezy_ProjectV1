"use client";

import React, { useState } from "react";
import { useApp, ResaleUnit } from "@/context/AppContext";
import { Plus, X, Search, Landmark, PhoneCall, Link2, CheckCircle } from "lucide-react";

export default function ResalePage() {
  const { resaleUnits, addResaleUnit, leads } = useApp();

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBuilder, setSelectedBuilder] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  // Post Resale modal state
  const [isPostOpen, setIsPostOpen] = useState(false);
  const [resaleProp, setResaleProp] = useState("");
  const [resaleBuilder, setResaleBuilder] = useState("");
  const [resaleLoc, setResaleLoc] = useState("");
  const [resalePrice, setResalePrice] = useState("");
  const [resaleDesc, setResaleDesc] = useState("");
  const [resaleOwner, setResaleOwner] = useState("SqftGenius Solutions LLP");

  // Lead finder modal
  const [matchingLeads, setMatchingLeads] = useState<any[]>([]);
  const [activeUnit, setActiveUnit] = useState<ResaleUnit | null>(null);

  // Extract unique builders
  const builders = ["All", ...Array.from(new Set(resaleUnits.map(r => r.builder)))];

  const filteredUnits = resaleUnits.filter(r => {
    const matchesSearch = r.property.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.builder.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBuilder = selectedBuilder === "All" || r.builder === selectedBuilder;
    return matchesSearch && matchesBuilder;
  });

  const handlePostResale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resaleProp || !resalePrice) {
      alert("Property name and price are required.");
      return;
    }
    addResaleUnit({
      property: resaleProp,
      builder: resaleBuilder || "—",
      location: resaleLoc || "—",
      price: resalePrice.includes("Cr") || resalePrice.includes("Lakh") ? resalePrice : `₹${resalePrice} Cr`,
      description: resaleDesc,
      listedBy: resaleOwner
    });
    setResaleProp("");
    setResaleBuilder("");
    setResaleLoc("");
    setResalePrice("");
    setResaleDesc("");
    setIsPostOpen(false);
  };

  const handleFindLeads = (unit: ResaleUnit) => {
    setActiveUnit(unit);
    // Find crm leads that have matching property names or interest zones
    const matches = leads.filter(l => 
      (l.property && l.property.toLowerCase().includes(unit.builder.toLowerCase())) ||
      (l.property && unit.property.toLowerCase().includes(l.property.toLowerCase()))
    );
    setMatchingLeads(matches);
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <Landmark className="h-5.5 w-5.5 text-brand-600" />
            Resale Market Brokerage
          </h2>
          <p className="text-xs text-slate-500">
            Browse resale listings across organizations, cross-reference customer demands, and match buyers.
          </p>
        </div>
        <button
          onClick={() => setIsPostOpen(true)}
          className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-700/10"
        >
          <Plus className="h-4 w-4" />
          Post Resale Unit
        </button>
      </div>

      {/* Filters Box */}
      <div className="glass-card p-5 rounded-2xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search listings, builders, amenities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-800 focus:outline-none"
            />
          </div>

          {/* Builder */}
          <div>
            <select
              value={selectedBuilder}
              onChange={(e) => setSelectedBuilder(e.target.value)}
              className="w-full bg-slate-55 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              <option value="All">All Builders</option>
              {builders.filter(b => b !== "All").map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Listings Table */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="p-4">Property</th>
                  <th className="p-4">Builder</th>
                  <th className="p-4">Location</th>
                  <th className="p-4">Price</th>
                  <th className="p-4">Listed By</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUnits.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-slate-800">{u.property}</p>
                      {u.description && <p className="text-[10px] text-slate-450 mt-0.5">{u.description}</p>}
                    </td>
                    <td className="p-4 text-slate-650 font-semibold">{u.builder}</td>
                    <td className="p-4 text-slate-500 font-medium">{u.location}</td>
                    <td className="p-4 font-mono font-bold text-brand-700">{u.price}</td>
                    <td className="p-4 text-slate-500 font-semibold">{u.listedBy}</td>
                    <td className="p-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleFindLeads(u)}
                          className="px-2.5 py-1 rounded bg-brand-50 border border-brand-200 text-[10px] font-bold text-brand-700 hover:bg-brand-700 hover:text-white transition-all"
                        >
                          Find Leads
                        </button>
                        <a
                          href={`tel:+919980189914`}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 inline-flex items-center gap-1"
                        >
                          <PhoneCall className="h-3 w-3" /> Contact
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Post Resale Unit Modal */}
      {isPostOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={() => setIsPostOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-brand-700">Post Resale Listing</h3>
              <button onClick={() => setIsPostOpen(false)} className="text-slate-400 hover:text-slate-655">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePostResale} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Name</label>
                <input
                  type="text"
                  required
                  value={resaleProp}
                  onChange={(e) => setResaleProp(e.target.value)}
                  placeholder="e.g. Prestige Meridian Park"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Builder / Group</label>
                <input
                  type="text"
                  value={resaleBuilder}
                  onChange={(e) => setResaleBuilder(e.target.value)}
                  placeholder="e.g. Prestige Group"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Location</label>
                  <input
                    type="text"
                    value={resaleLoc}
                    onChange={(e) => setResaleLoc(e.target.value)}
                    placeholder="e.g. Sarjapur Road"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Price (INR)</label>
                  <input
                    type="text"
                    required
                    value={resalePrice}
                    onChange={(e) => setResalePrice(e.target.value)}
                    placeholder="e.g. 2.40 Cr"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Specifications</label>
                <textarea
                  value={resaleDesc}
                  onChange={(e) => setResaleDesc(e.target.value)}
                  placeholder="e.g. 3+Maid - 1865 Sft - East Facing, north side balcony..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-700 hover:bg-brand-600 text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-sm"
              >
                Post Listing
              </button>
            </form>
          </div>
        </>
      )}

      {/* Find Leads Modal */}
      {activeUnit && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={() => setActiveUnit(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-brand-700 flex items-center gap-1.5">
                <Link2 className="h-4.5 w-4.5 text-brand-600" />
                Matching Buyer Leads
              </h3>
              <button onClick={() => setActiveUnit(null)} className="text-slate-400 hover:text-slate-655">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-[10px] text-slate-550 leading-relaxed font-semibold">
              Cross-referencing active CRM lead properties with resale listing builder **{activeUnit.builder}**.
            </p>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {matchingLeads.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No active buyers found with matching developer preferences.
                </div>
              ) : (
                matchingLeads.map((l) => (
                  <div key={l.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{l.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">+91-{l.phone} • {l.email}</p>
                      <span className="inline-block mt-1 bg-brand-50 border border-brand-100 text-[9px] font-bold text-brand-700 px-1.5 py-0.5 rounded">
                        Prefers: {l.property}
                      </span>
                    </div>
                    <div className="text-right space-y-1">
                      <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-700 border border-slate-250 rounded">
                        {l.status}
                      </span>
                      <p className="text-[10px] text-slate-500">Agent: {l.assignedAgent.split(" ")[0]}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
