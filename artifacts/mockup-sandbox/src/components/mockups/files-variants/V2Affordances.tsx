const SAMPLE_FILES = [
  { fileId: "8935873", fileName: "WF Auburn-Plains-QWO-Wheat.jpg", folderName: "CAB Door Styles", sizeBytes: 29562, attachedRecordCount: 1, hasStub: false },
  { fileId: "9582316", fileName: "Po747872-Signoff.pdf", folderName: "Build Docs", sizeBytes: 46222, attachedRecordCount: 1, hasStub: false },
  { fileId: "110615", fileName: "110615-Vogel.pdf", folderName: "Expense Reimbursements", sizeBytes: 89340, attachedRecordCount: 2, hasStub: true },
  { fileId: "8933634", fileName: "UC Acrilux II Linear Black Angled.png", folderName: "CAB Door Styles", sizeBytes: 480506, attachedRecordCount: 1, hasStub: false },
  { fileId: "60", fileName: "Sample Sales PDF", folderName: "* Documents", sizeBytes: 112000, attachedRecordCount: 1, hasStub: true },
  { fileId: "92", fileName: "James Brazoban Travel.pdf", folderName: "Expense Reimbursements", sizeBytes: 54000, attachedRecordCount: 0, hasStub: false },
  { fileId: "493", fileName: "charles-e2-061011.PDF", folderName: "* Documents", sizeBytes: 23000, attachedRecordCount: 1, hasStub: true },
  { fileId: "494", fileName: "13941-d5-080511.PDF", folderName: "* Documents", sizeBytes: 18000, attachedRecordCount: 0, hasStub: false },
  { fileId: "495", fileName: "Abraham-d5-090611.pdf", folderName: "* Documents", sizeBytes: 31000, attachedRecordCount: 1, hasStub: true },
  { fileId: "596", fileName: "Farley-l4-101411.pdf", folderName: "* Documents", sizeBytes: 27000, attachedRecordCount: 1, hasStub: true },
];

type Filter = "all" | "has_stub" | "missing_stub";

import { useState } from "react";

export function V2Affordances() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = SAMPLE_FILES.filter(f => {
    const matchSearch = !search || f.fileName.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "has_stub" ? f.hasStub : !f.hasStub);
    return matchSearch && matchFilter;
  });

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Files</h1>
        <span className="text-sm text-gray-500">2,089,051 total</span>
      </div>

      {/* Toolbar — every control has a clear affordance and visible state */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex gap-3 items-center">
        {/* Search with clear button — affordance: users know they can clear it */}
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search files by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* Segmented button group — all options visible, active state obvious */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden shrink-0 bg-white">
          {([["all", "All"], ["has_stub", "Stubbed"], ["missing_stub", "Missing"]] as [Filter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3.5 py-2 text-sm font-medium border-r last:border-r-0 border-gray-300 transition-colors
                ${filter === val
                  ? val === "missing_stub"
                    ? "bg-red-500 text-white border-red-500"
                    : val === "has_stub"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-blue-600 text-white border-blue-600"
                  : "text-gray-600 hover:bg-gray-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table with sticky header — columns stay visible while scrolling */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 shadow-sm">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-[35%]">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-[22%]">Folder</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-[10%]">ID</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 w-[12%]">Size</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 w-[8%]">Records</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 w-[13%]">Stub status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No files match your filters</td></tr>
                ) : filtered.map((file) => (
                  <tr key={file.fileId} className="hover:bg-blue-50 cursor-pointer group transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{file.fileName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{file.folderName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{file.fileId}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 text-right">{(file.sizeBytes / 1024).toFixed(1)} KB</td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium text-right">{file.attachedRecordCount}</td>
                    <td className="px-4 py-3 text-center">
                      {/* Pill badges with enough contrast to be click-targetable */}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                        ${file.hasStub ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {file.hasStub
                          ? <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>Stubbed</>
                          : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>Missing</>
                        }
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination — always visible, never buried */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500">Showing {filtered.length} of 2,089,051 files</span>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40">← Previous</button>
              <span className="text-xs text-gray-500">Page 1</span>
              <button className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50">Next →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
