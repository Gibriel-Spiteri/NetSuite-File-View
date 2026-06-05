const SAMPLE_FILES = [
  { fileId: "8935873", fileName: "WF Auburn-Plains-QWO-Wheat.jpg", folderName: "CAB Door Styles", sizeBytes: 29562, attachedRecordCount: 1, hasStub: false },
  { fileId: "9582316", fileName: "Po747872-Signoff.pdf", folderName: "Build Docs", sizeBytes: 46222, attachedRecordCount: 1, hasStub: false },
  { fileId: "110615-Vogel.pdf", fileName: "110615-Vogel.pdf", folderName: "Expense Reimbursements", sizeBytes: 89340, attachedRecordCount: 2, hasStub: true },
  { fileId: "8933634", fileName: "UC Acrilux II Linear Black Angled.png", folderName: "CAB Door Styles", sizeBytes: 480506, attachedRecordCount: 1, hasStub: false },
  { fileId: "60", fileName: "Sample Sales PDF", folderName: "* Documents", sizeBytes: 112000, attachedRecordCount: 1, hasStub: true },
  { fileId: "92", fileName: "James Brazoban Travel.pdf", folderName: "Expense Reimbursements", sizeBytes: 54000, attachedRecordCount: 0, hasStub: false },
  { fileId: "493", fileName: "charles-e2-061011.PDF", folderName: "* Documents", sizeBytes: 23000, attachedRecordCount: 1, hasStub: true },
  { fileId: "494", fileName: "13941-d5-080511.PDF", folderName: "* Documents", sizeBytes: 18000, attachedRecordCount: 0, hasStub: false },
  { fileId: "495", fileName: "Abraham-d5-090611.pdf", folderName: "* Documents", sizeBytes: 31000, attachedRecordCount: 1, hasStub: true },
  { fileId: "596", fileName: "Farley-l4-101411.pdf", folderName: "* Documents", sizeBytes: 27000, attachedRecordCount: 1, hasStub: true },
];

const totalFiles = 2089051;
const stubbed = 1093402;
const missing = totalFiles - stubbed;
const pct = ((stubbed / totalFiles) * 100).toFixed(1);

export function V1Hierarchy() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Page header with summary stats — makes the "so what" immediately visible */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Files</h1>
          <span className="text-xs text-gray-400">2,089,051 files total</span>
        </div>
        {/* Stat strip — primary context before table */}
        <div className="flex gap-6">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-gray-900">{pct}%</span>
            <span className="text-xs text-gray-500 mt-0.5">Stub coverage</span>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-emerald-600">{stubbed.toLocaleString()}</span>
            <span className="text-xs text-gray-500 mt-0.5">Stubbed</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-red-500">{missing.toLocaleString()}</span>
            <span className="text-xs text-gray-500 mt-0.5">Missing stub</span>
          </div>
        </div>
      </div>

      {/* Filter bar — secondary, visually lighter than the stats */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md bg-gray-50 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white" placeholder="Search files…" />
        </div>
        <select className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-gray-50 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option>All status</option>
          <option>Stubbed</option>
          <option>Missing stub</option>
        </select>
      </div>

      {/* Table — name is the anchor of each row, everything else is subordinate */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {/* Name column is widest — it's the primary identifier */}
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[38%]">File name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[22%]">Folder</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[10%]">ID</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[12%]">Size</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[10%]">Records</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[8%]">Stub</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {SAMPLE_FILES.map((file) => (
                <tr key={file.fileId} className="hover:bg-gray-50 group">
                  {/* Status-colored left stripe gives instant scannability */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-1 h-8 rounded-full shrink-0 ${file.hasStub ? "bg-emerald-400" : "bg-red-400"}`} />
                      <span className="font-medium text-gray-800 text-sm leading-snug" title={file.fileName}>
                        {file.fileName}
                      </span>
                    </div>
                  </td>
                  {/* Folder is secondary context — muted */}
                  <td className="px-4 py-3 text-xs text-gray-400">{file.folderName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{file.fileId}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 text-right">{(file.sizeBytes / 1024).toFixed(1)} KB</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-700 text-right">{file.attachedRecordCount}</td>
                  <td className="px-4 py-3 text-center">
                    {file.hasStub
                      ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span>
                      : <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-500"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">Showing 10 of 2,089,051</span>
            <div className="flex gap-1">
              <button className="px-2.5 py-1 text-xs border border-gray-200 rounded text-gray-500 hover:bg-gray-50">Previous</button>
              <button className="px-2.5 py-1 text-xs border border-gray-200 rounded text-gray-500 hover:bg-gray-50">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
