import { useState, Fragment } from "react";
import { useGetCompletionErrors, useGetNetsuiteStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Search } from "lucide-react";
import { nsRecordUrl } from "@/lib/ns-url";

export function CompletionErrors() {
  const { data, isLoading } = useGetCompletionErrors();
  const { data: nsStatus } = useGetNetsuiteStatus();
  const accountId = nsStatus?.accountId ?? null;
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (fileId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });

  const q = search.trim().toLowerCase();
  const filtered = (data?.errors ?? []).filter(
    (e) =>
      !q ||
      e.fileId.includes(q) ||
      (e.fileName ?? "").toLowerCase().includes(q) ||
      e.status.toLowerCase().includes(q) ||
      e.records.some(
        (r) =>
          r.recordType.toLowerCase().includes(q) ||
          r.recordId.toLowerCase().includes(q) ||
          r.recordName.toLowerCase().includes(q),
      ),
  );

  const byStatus = filtered.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg px-4 py-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-semibold text-sm">
            {isLoading ? "…" : (data?.totalErrorFiles ?? 0).toLocaleString()} files with errors
          </span>
        </div>
        {!isLoading &&
          Object.entries(byStatus)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <div
                key={status}
                className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm"
              >
                <span className="font-mono text-xs text-destructive">{status}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by file ID, file name, status, record type, or record name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Error files</CardTitle>
          <CardDescription>
            Files whose deletion returned an error status. Expand a row to see every record it's
            attached to — those are the NetSuite records that need manual attention.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8" />
                <TableHead>File ID</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Error Status</TableHead>
                <TableHead className="text-right">Attached Records</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    {data?.totalErrorFiles === 0
                      ? "No error entries in the loaded deletion log."
                      : "No results match your search."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((entry) => {
                  const open = expanded.has(entry.fileId);
                  return (
                    <Fragment key={entry.fileId}>
                      <TableRow
                        key={entry.fileId}
                        className={`cursor-pointer hover:bg-muted/50 ${open ? "bg-muted/30" : ""}`}
                        onClick={() => entry.records.length > 0 && toggleExpand(entry.fileId)}
                      >
                        <TableCell className="pl-4">
                          {entry.records.length > 0 ? (
                            open ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{entry.fileId}</TableCell>
                        <TableCell className="text-sm max-w-[280px] truncate" title={entry.fileName ?? undefined}>
                          {entry.fileName ?? <span className="text-muted-foreground italic">unknown</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="font-mono text-xs">
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {entry.records.length > 0 ? (
                            <span className="text-muted-foreground">{entry.records.length}</span>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">not in dataset</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={5} className="py-0">
                            <div className="ml-8 border-l-2 border-muted-foreground/20 pl-4 py-3 space-y-1.5">
                              <div className="text-xs font-medium text-muted-foreground mb-2">
                                Attached records
                              </div>
                              {entry.records.map((r) => {
                                const url = accountId
                                  ? nsRecordUrl(accountId, r.recordType, r.recordId)
                                  : null;
                                return (
                                  <div
                                    key={`${r.recordType}-${r.recordId}`}
                                    className="flex items-center gap-3 text-sm"
                                  >
                                    <Badge variant="outline" className="text-xs shrink-0">
                                      {r.recordType}
                                    </Badge>
                                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                                      #{r.recordId}
                                    </span>
                                    <span className="truncate flex-1">{r.recordName}</span>
                                    {url ? (
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="shrink-0 flex items-center gap-1 text-xs text-primary hover:underline"
                                      >
                                        Open <ExternalLink className="h-3 w-3" />
                                      </a>
                                    ) : (
                                      <span className="shrink-0 text-xs text-muted-foreground italic">
                                        (configure NS to link)
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
