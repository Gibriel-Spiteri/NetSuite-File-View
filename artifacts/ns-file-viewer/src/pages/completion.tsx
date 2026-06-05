import { useState, useRef } from "react";
import {
  useGetCompletion,
  useUploadData,
  useClearDeletionLog,
  getGetCompletionQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileCheck2, AlertCircle, Trash2, CheckCircle2 } from "lucide-react";

export function Completion() {
  const { data, isLoading } = useGetCompletion();
  const uploadData = useUploadData();
  const clearLog = useClearDeletionLog();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetCompletionQueryKey() });

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    let totalAdded = 0;
    for (const f of list) {
      const content = await f.text();
      await new Promise<void>((resolve) => {
        uploadData.mutate(
          { data: { type: "deletion_log", content, source: f.name } },
          {
            onSuccess: (res) => { totalAdded += res.rowCount; resolve(); },
            onError: (err: Error) => {
              toast({ title: `Upload Failed: ${f.name}`, description: err.message, variant: "destructive" });
              resolve();
            },
          },
        );
      });
    }
    toast({ title: "Deletion logs ingested", description: `Added ${totalAdded.toLocaleString()} rows from ${list.length} file(s).` });
    invalidate();
  };

  const handleClear = () => {
    if (!confirm("Clear all loaded deletion log rows? This won't delete the files in NetSuite — it only resets the local tracker.")) return;
    clearLog.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Deletion log cleared" });
        invalidate();
      },
      onError: (err: Error) => toast({ title: "Clear failed", description: err.message, variant: "destructive" }),
    });
  };

  const stateBadge = (row: { totalOrigs: number; deletedCount: number; errorCount: number }) => {
    if (row.deletedCount === 0) return <Badge variant="outline">Not started</Badge>;
    if (row.deletedCount >= row.totalOrigs) return <Badge className="bg-emerald-600 hover:bg-emerald-600">Complete</Badge>;
    if (row.errorCount > 0) return <Badge variant="destructive">In progress (errors)</Badge>;
    return <Badge variant="secondary">In progress</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Overall summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<FileCheck2 className="h-5 w-5 text-emerald-600" />}
          label="Deleted from cabinet"
          value={data?.overall.totalDeleted ?? 0}
          sub={`${data?.overall.coveragePercent ?? 0}% of ${data?.overall.totalOrigs.toLocaleString() ?? 0} origs`}
        />
        <SummaryCard
          icon={<UploadCloud className="h-5 w-5 text-sky-600" />}
          label="Remaining"
          value={data?.overall.totalRemaining ?? 0}
          sub="origs still in cabinet"
        />
        <SummaryCard
          icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
          label="Errors"
          value={data?.overall.totalErrors ?? 0}
          sub="see status breakdown"
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5 text-slate-500" />}
          label="Protected (kept)"
          value={data?.overall.totalProtected ?? 0}
          sub="protected ext — orig kept"
        />
      </div>

      {/* Drag-and-drop log uploader */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Phase 3 Delete Logs</CardTitle>
          <CardDescription>
            Drop one or more <code className="text-xs bg-muted px-1 py-0.5 rounded">phase3_delete_log_*.txt</code> files here.
            Multiple uploads accumulate by fileId; the latest status wins per row.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:bg-muted/50"
            }`}
          >
            <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Drop log files here, or click to pick</p>
            <p className="text-xs text-muted-foreground mt-1">
              Format: <code>fileId|status</code>, one row per line, with header
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.log"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {data && (data.deletionLogEntryCount > 0 || data.sources.length > 0) && (
            <div className="flex items-start justify-between gap-4 flex-wrap text-sm">
              <div>
                <div className="font-medium">
                  {data.deletionLogEntryCount.toLocaleString()} log rows loaded
                </div>
                {data.sources.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Sources: {data.sources.map((s) => (
                      <Badge key={s} variant="outline" className="mr-1 mb-1">{s}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleClear} disabled={clearLog.isPending}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear log
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status distribution */}
      {data && Object.keys(data.statusCounts).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Status distribution</CardTitle>
            <CardDescription>Counts across every row in every uploaded log.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {Object.entries(data.statusCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between p-2 rounded border bg-card">
                    <span className={`text-xs font-mono truncate ${status.startsWith("error") ? "text-destructive" : ""}`}>{status}</span>
                    <span className="text-sm font-semibold ml-2">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-record-type table */}
      <Card>
        <CardHeader>
          <CardTitle>Progress by record type</CardTitle>
          <CardDescription>
            Origs attached to records of each type, and how many we've deleted. A file attached to
            multiple types counts in each (deleting it advances every row simultaneously).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Record Type</TableHead>
                <TableHead className="text-right">Total Origs</TableHead>
                <TableHead className="text-right">Deleted</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="text-right">Coverage</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : !data?.perType.length ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No record attachments loaded yet.</TableCell></TableRow>
              ) : (
                data.perType.map((row) => (
                  <TableRow key={row.recordType}>
                    <TableCell className="font-medium text-xs">
                      <Badge variant="outline">{row.recordType}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{row.totalOrigs.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      <span className={row.deletedCount > 0 ? "text-emerald-600 font-semibold" : ""}>
                        {row.deletedCount.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{row.remainingCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {row.errorCount > 0
                        ? <span className="text-destructive font-semibold">{row.errorCount.toLocaleString()}</span>
                        : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <CoverageBar percent={row.coveragePercent} />
                    </TableCell>
                    <TableCell>{stateBadge(row)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">{sub}</div>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function CoverageBar({ percent }: { percent: number }) {
  const pct = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="text-xs font-mono w-12 text-right">{pct.toFixed(1)}%</span>
      <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full ${pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-sky-500" : "bg-muted-foreground/20"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
