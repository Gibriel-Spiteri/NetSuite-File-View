import { useState, Fragment } from "react";
import { useListAllFiles, useGetFileRecords, useGetNetsuiteStatus } from "@workspace/api-client-react";
import type { ListAllFilesParams, ListAllFilesStubStatus, ListAllFilesSort } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, ExternalLink, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { nsRecordUrl } from "@/lib/ns-url";

const PAGE_SIZES = [50, 100, 250, 500];

function FileRecordDetail({ fileId, accountId }: { fileId: string; accountId: string | null }) {
  const { data, isLoading } = useGetFileRecords(fileId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 px-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading attached records…
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="py-4 px-2 text-sm text-muted-foreground italic">
        No records found in dataset for this file.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {data.map((r) => {
        const url = accountId ? nsRecordUrl(accountId, r.recordType, r.recordId) : null;
        return (
          <div
            key={`${r.recordType}-${r.recordId}`}
            className="flex items-center gap-3 text-sm py-0.5"
          >
            <Badge variant="outline" className="text-xs shrink-0">{r.recordType}</Badge>
            <span className="font-mono text-xs text-muted-foreground shrink-0">#{r.recordId}</span>
            <span className="truncate flex-1 text-xs">{r.recordName}</span>
            {r.recordStatus && (
              <span className="text-xs text-muted-foreground shrink-0 italic">{r.recordStatus}</span>
            )}
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function Files() {
  const [params, setParams] = useState<ListAllFilesParams>({
    limit: 100,
    offset: 0,
    stubStatus: "all",
    sort: "file_id_asc",
  });
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);

  const { data, isLoading } = useListAllFiles(params);
  const { data: nsStatus } = useGetNetsuiteStatus();
  const accountId = nsStatus?.accountId ?? null;

  const total = data?.total ?? 0;
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  function goToPage(page: number) {
    setParams(p => ({ ...p, offset: (page - 1) * (p.limit ?? 100) }));
    setExpandedFileId(null);
  }

  function toggleExpand(fileId: string) {
    setExpandedFileId(prev => prev === fileId ? null : fileId);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex gap-4 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files by name or ID..."
              className="pl-9"
              value={params.search || ""}
              onChange={e => setParams(p => ({ ...p, search: e.target.value || undefined, offset: 0 }))}
            />
          </div>

          <Select
            value={params.stubStatus || "all"}
            onValueChange={v => setParams(p => ({ ...p, stubStatus: v as ListAllFilesStubStatus, offset: 0 }))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Stub Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="has_stub">Has Stub</SelectItem>
              <SelectItem value="missing_stub">Missing Stub</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={params.sort || "file_id_asc"}
            onValueChange={v => setParams(p => ({ ...p, sort: v as ListAllFilesSort, offset: 0 }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="file_id_asc">File ID ↑ (default)</SelectItem>
              <SelectItem value="file_id_desc">File ID ↓</SelectItem>
              <SelectItem value="file_name">File Name A–Z</SelectItem>
              <SelectItem value="records_desc">Records ↓</SelectItem>
              <SelectItem value="records_asc">Records ↑</SelectItem>
              <SelectItem value="created_date_desc">Created ↓</SelectItem>
              <SelectItem value="created_date_asc">Created ↑</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows:</span>
            <Select
              value={String(limit)}
              onValueChange={v => setParams(p => ({ ...p, limit: Number(v), offset: 0 }))}
            >
              <SelectTrigger className="w-[80px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>File ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Folder</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-center">Stub Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading files...
                  </TableCell>
                </TableRow>
              ) : !data?.files.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No files found matching filters.
                  </TableCell>
                </TableRow>
              ) : (
                data.files.map(file => {
                  const isOpen = expandedFileId === file.fileId;
                  const hasRecords = file.attachedRecordCount > 0;
                  return (
                    <Fragment key={file.fileId}>
                      <TableRow className={isOpen ? "bg-muted/30" : undefined}>
                        <TableCell className="font-mono text-xs">{file.fileId}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={file.fileName}>
                          {file.fileName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {file.folderName || "-"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {file.createdDate || "-"}
                        </TableCell>
                        <TableCell className="text-xs">{formatBytes(file.sizeBytes)}</TableCell>
                        <TableCell className="text-right">
                          {hasRecords ? (
                            <button
                              onClick={() => toggleExpand(file.fileId)}
                              className="inline-flex items-center gap-1 font-medium text-primary hover:underline text-sm cursor-pointer"
                              title="Click to see attached records"
                            >
                              {isOpen
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRightIcon className="h-3.5 w-3.5" />}
                              {file.attachedRecordCount}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-sm">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={file.hasStub ? "outline" : "destructive"}>
                            {file.hasStub ? "Stubbed" : "Missing"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/10 hover:bg-muted/10">
                          <TableCell colSpan={7} className="py-0">
                            <div className="ml-6 border-l-2 border-primary/20 pl-4 py-3">
                              <div className="text-xs font-medium text-muted-foreground mb-2">
                                Attached records ({file.attachedRecordCount})
                              </div>
                              <FileRecordDetail fileId={file.fileId} accountId={accountId} />
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
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
          <span>
            {total > 0
              ? `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()} files`
              : "No files"}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => goToPage(1)} disabled={currentPage === 1 || isLoading}>«</Button>
            <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1 || isLoading}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 py-1 text-sm">
              Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
            </span>
            <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages || isLoading}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => goToPage(totalPages)} disabled={currentPage >= totalPages || isLoading}>»</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
