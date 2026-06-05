import { useGetSummary, useGetStubCoverage } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Files, Database, Link as LinkIcon, FileQuestion, HardDrive } from "lucide-react";
import { formatBytes } from "@/lib/format";

export function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetSummary();
  const { data: coverage, isLoading: isCoverageLoading } = useGetStubCoverage();

  if (isSummaryLoading || isCoverageLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-muted rounded-lg" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  if (!summary || !summary.totalFiles) {
    return <div className="text-center text-muted-foreground p-8">No data loaded yet. Upload data on the <a href="/upload" className="underline">Data Sources</a> page.</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Files" value={summary.totalFiles.toLocaleString()} icon={Files} />
        <StatCard title="Total Records" value={summary.totalRecords.toLocaleString()} icon={Database} />
        <StatCard title="Total Attachments" value={summary.totalAttachments.toLocaleString()} icon={LinkIcon} />
        <StatCard title="Total File Size" value={formatBytes(summary.totalSizeBytes)} icon={HardDrive} />
        <StatCard title="Stub Coverage" value={`${summary.stubCoveragePercent.toFixed(1)}%`} icon={FileQuestion} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stub Coverage by Record Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            {coverage && coverage.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coverage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="recordType" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}%`} domain={[0, 100]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md space-y-1">
                          <div className="font-semibold text-foreground">{d.recordType}</div>
                          <div className="text-muted-foreground">Coverage: <span className="font-medium text-foreground">{d.coveragePercent.toFixed(1)}%</span></div>
                          <div className="text-muted-foreground">Files: <span className="font-medium text-foreground">{d.fileCount.toLocaleString()}</span></div>
                          <div className="text-muted-foreground">Total size: <span className="font-medium text-foreground">{formatBytes(d.totalSizeBytes)}</span></div>
                          {d.missingStubCount > 0 && (
                            <div className="text-destructive">Missing stubs: {d.missingStubCount.toLocaleString()}</div>
                          )}
                        </div>
                      );
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.05)" }}
                  />
                  <Bar dataKey="coveragePercent" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No coverage data available</div>
            )}
          </div>
        </CardContent>
      </Card>

      {coverage && coverage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>File Size by Record Type</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {[...coverage].sort((a, b) => b.totalSizeBytes - a.totalSizeBytes).map((row) => {
                const maxSize = Math.max(...coverage.map(c => c.totalSizeBytes));
                const pct = maxSize > 0 ? (row.totalSizeBytes / maxSize) * 100 : 0;
                return (
                  <div key={row.recordType} className="px-6 py-3 flex items-center gap-4">
                    <div className="w-40 shrink-0 text-sm font-mono text-muted-foreground truncate">{row.recordType}</div>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-24 text-right text-sm font-medium shrink-0">{formatBytes(row.totalSizeBytes)}</div>
                    <div className="w-28 text-right text-xs text-muted-foreground shrink-0">{row.fileCount.toLocaleString()} files</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ElementType }) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0">
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}
