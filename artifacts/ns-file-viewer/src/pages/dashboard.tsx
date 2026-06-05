import { useGetSummary, useGetStubCoverage } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Files, Database, Link as LinkIcon, FileQuestion } from "lucide-react";

export function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetSummary();
  const { data: coverage, isLoading: isCoverageLoading } = useGetStubCoverage();

  if (isSummaryLoading || isCoverageLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-32 bg-muted rounded-lg" />
      <div className="h-64 bg-muted rounded-lg" />
    </div>;
  }

  if (!summary) {
    return <div className="text-center text-muted-foreground p-8">No data loaded yet.</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Files" value={summary.totalFiles} icon={Files} />
        <StatCard title="Total Records" value={summary.totalRecords} icon={Database} />
        <StatCard title="Total Attachments" value={summary.totalAttachments} icon={LinkIcon} />
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
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}%`} />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Coverage']}
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    contentStyle={{ borderRadius: '6px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
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
        <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}
