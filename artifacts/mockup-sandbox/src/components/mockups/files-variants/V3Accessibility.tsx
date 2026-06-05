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

export function V3Accessibility() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* High-contrast header — no ambiguity about where you are */}
      <div className="bg-gray-900 px-6 py-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Files</h1>
        <p className="text-sm text-gray-400 mt-1">2,089,051 files · 88.1% stub coverage</p>
      </div>

      {/* Generous filter bar — larger targets, clear labels above inputs */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex gap-4 items-end">
          <div className="flex flex-col gap-1 flex-1 max-w-sm">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Search</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                className="w-full pl-9 pr-4 py-2.5 text-base border-2 border-gray-300 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:border-blue-600"
                placeholder="Search files by name or ID…"
                aria-label="Search files"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Stub status</label>
            <select
              className="py-2.5 px-3 text-base border-2 border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:border-blue-600 cursor-pointer"
              aria-label="Filter by stub status"
            >
              <option>All status</option>
              <option>Stubbed only</option>
              <option>Missing stub only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table — generous row height, no truncation, high-contrast status text */}
      <div className="px-6 pt-5">
        <div className="rounded-xl border-2 border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-200">
                {/* Column headers are sentence case, visually prominent */}
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700 w-[34%]">File name</th>
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700 w-[22%]">Folder</th>
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700 w-[10%]">File ID</th>
                <th className="text-right px-5 py-4 text-sm font-bold text-gray-700 w-[11%]">Size</th>
                <th className="text-right px-5 py-4 text-sm font-bold text-gray-700 w-[9%]">Records</th>
                {/* Status label is descriptive, not abbreviated */}
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700 w-[14%]">Stub status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SAMPLE_FILES.map((file, i) => (
                <tr key={file.fileId} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-blue-50 transition-colors`}>
                  {/* No truncation — filename wraps at 2 lines so it's fully readable */}
                  <td className="px-5 py-4">
                    <span className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{file.fileName}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{file.folderName}</td>
                  <td className="px-5 py-4 font-mono text-sm text-gray-500">{file.fileId}</td>
                  <td className="px-5 py-4 text-sm text-gray-600 text-right">{(file.sizeBytes / 1024).toFixed(1)} KB</td>
                  <td className="px-5 py-4 text-sm font-semibold text-gray-800 text-right">{file.attachedRecordCount}</td>
                  {/* Status uses explicit full text + color + icon — not just color alone */}
                  <td className="px-5 py-4">
                    {file.hasStub ? (
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        Stubbed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-red-600">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        Missing stub
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Generous pagination — large targets, clear labeling */}
          <div className="px-5 py-4 border-t-2 border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-sm text-gray-600">Showing <strong className="text-gray-900">10</strong> of <strong className="text-gray-900">2,089,051</strong> files</p>
            <div className="flex gap-2">
              <button className="px-4 py-2 text-sm font-semibold border-2 border-gray-300 rounded-lg text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Previous
              </button>
              <button className="px-4 py-2 text-sm font-semibold border-2 border-blue-600 rounded-lg text-white bg-blue-600 hover:bg-blue-700">
                Next page
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
