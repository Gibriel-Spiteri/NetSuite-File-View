import { useState } from "react";
import { useListRecords, useListRecordTypes, useGetRecordFiles, useGetNetsuiteStatus, getGetRecordFilesQueryKey } from "@workspace/api-client-react";
import type { ListRecordsParams, ListRecordsStubStatus, ListRecordsSort } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ExternalLink } from "lucide-react";
import { buildNetsuiteUrl } from "@/lib/netsuite";
import { formatBytes } from "@/lib/format";

function NetsuiteLink({ recordType, recordId, accountId }: { recordType: string; recordId: string; accountId: string | undefined }) {
  if (!accountId) return null;
  const url = buildNetsuiteUrl(accountId, recordType, recordId);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0" title="Open in NetSuite">
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </a>
  );
}

export function Records() {
  const [params, setParams] = useState<ListRecordsParams>({
    limit: 50,
    offset: 0,
    stubStatus: "all",
  });
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<{ recordType: string; recordName: string } | null>(null);

  const { data: recordTypes } = useListRecordTypes();
  const { data, isLoading } = useListRecords(params);
  const { data: nsStatus } = useGetNetsuiteStatus();
  const accountId = nsStatus?.accountId || undefined;

  const pagination = data ? {
    start: (params.offset ?? 0) + 1,
    end: Math.min((params.offset ?? 0) + (params.limit ?? 50), data.total),
    total: data.total,
  } : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search records..."
              className="pl-9"
              value={params.search || ""}
              onChange={e => setParams(p => ({ ...p, search: e.target.value || undefined, offset: 0 }))}
            />
          </div>

          <Select
            value={params.recordType || "all"}
            onValueChange={v => setParams(p => ({ ...p, recordType: v === "all" ? undefined : v, offset: 0 }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {recordTypes?.map(t => (
                <SelectItem key={t.recordType} value={t.recordType}>{t.recordType} ({t.recordCount})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={params.stubStatus || "all"}
            onValueChange={v => setParams(p => ({ ...p, stubStatus: v as ListRecordsStubStatus, offset: 0 }))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Stub Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="has_stub">Has Stub</SelectItem>
              <SelectItem value="missing_stub">Missing Stub</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={params.sort || "none"}
            onValueChange={v => setParams(p => ({ ...p, sort: v === "none" ? undefined : v as ListRecordsSort, offset: 0 }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Default order</SelectItem>
              <SelectItem value="missing_stubs_desc">Missing stubs ↓</SelectItem>
              <SelectItem value="missing_stubs_asc">Missing stubs ↑</SelectItem>
              <SelectItem value="record_name">Name A–Z</SelectItem>
              <SelectItem value="record_type">Type A–Z</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Type</TableHead>
                <TableHead>Record ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead className="text-right">Missing Stubs</TableHead>
                {accountId && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={accountId ? 6 : 5} className="text-center py-8 text-muted-foreground">Loading records...</TableCell></TableRow>
              ) : !data?.records.length ? (
                <TableRow><TableCell colSpan={accountId ? 6 : 5} className="text-center py-8 text-muted-foreground">No records found matching filters.</TableCell></TableRow>
              ) : (
                data.records.map(record => (
                  <TableRow
                    key={record.recordId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedRecordId(record.recordId);
                      setSelectedRecord({ recordType: record.recordType, recordName: record.recordName });
                    }}
                  >
                    <TableCell className="font-medium text-xs"><Badge variant="outline">{record.recordType}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{record.recordId}</TableCell>
                    <TableCell>
                      <div>{record.recordName}</div>
                      {record.recordStatus && (
                        <div className="text-xs text-muted-foreground mt-0.5">{record.recordStatus}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{record.fileCount}</TableCell>
                    <TableCell className="text-right">
                      {record.missingStubCount > 0 ? (
                        <span className="text-destructive font-bold">{record.missingStubCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    {accountId && (
                      <TableCell className="text-center p-1">
                        <NetsuiteLink accountId={accountId} recordType={record.recordType} recordId={record.recordId} />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pagination && pagination.total > (params.limit ?? 50) && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
            <span>Showing {pagination.start}–{pagination.end} of {pagination.total.toLocaleString()}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={(params.offset ?? 0) === 0}
                onClick={() => setParams(p => ({ ...p, offset: Math.max(0, (p.offset ?? 0) - (p.limit ?? 50)) }))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.end >= pagination.total}
                onClick={() => setParams(p => ({ ...p, offset: (p.offset ?? 0) + (p.limit ?? 50) }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <RecordDetailsSheet
        recordId={selectedRecordId}
        recordMeta={selectedRecord}
        accountId={accountId}
        onClose={() => { setSelectedRecordId(null); setSelectedRecord(null); }}
      />
    </div>
  );
}

function RecordDetailsSheet({
  recordId,
  recordMeta,
  accountId,
  onClose,
}: {
  recordId: string | null;
  recordMeta: { recordType: string; recordName: string } | null;
  accountId: string | undefined;
  onClose: () => void;
}) {
  const { data: files, isLoading } = useGetRecordFiles(recordId || "", {
    query: { enabled: !!recordId, queryKey: getGetRecordFilesQueryKey(recordId || "") }
  });

  return (
    <Sheet open={!!recordId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0">
              <SheetTitle>Record Attachments</SheetTitle>
              <SheetDescription className="mt-1 space-y-0.5">
                {recordMeta && (
                  <span className="mr-2">
                    <Badge variant="outline" className="text-xs mr-1">{recordMeta.recordType}</Badge>
                    {recordMeta.recordName}
                  </span>
                )}
                <br />
                ID: <span className="font-mono">{recordId}</span>
                {files && files.length > 0 && (
                  <>
                    <span className="mx-1">·</span>
                    <span>{files.length} files</span>
                    <span className="mx-1">·</span>
                    <span>{formatBytes(files.reduce((s, f) => s + f.sizeBytes, 0))}</span>
                  </>
                )}
              </SheetDescription>
            </div>
            {accountId && recordId && recordMeta && (
              <a
                href={buildNetsuiteUrl(accountId, recordMeta.recordType, recordId)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 mt-1"
              >
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in NetSuite
                </Button>
              </a>
            )}
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading files...</div>
        ) : !files?.length ? (
          <div className="py-8 text-center text-muted-foreground">No files attached to this record.</div>
        ) : (
          <div className="space-y-4">
            {files.map(file => (
              <Card key={file.fileId}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate" title={file.fileName}>{file.fileName}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-2 flex-wrap">
                        <span>ID: <span className="font-mono">{file.fileId}</span></span>
                        <span>•</span>
                        <span>Size: {formatBytes(file.sizeBytes)}</span>
                      </div>
                    </div>
                    {file.isStubFile ? (
                      <Badge variant="secondary" className="shrink-0">Stub File</Badge>
                    ) : file.hasStub ? (
                      <Badge variant="default" className="shrink-0">Has Stub</Badge>
                    ) : (
                      <Badge variant="destructive" className="shrink-0">Missing Stub</Badge>
                    )}
                  </div>
                  {file.hasStub && file.stubFileName && (
                    <div className="mt-3 text-xs bg-muted p-2 rounded flex gap-2">
                      <span className="text-muted-foreground font-medium shrink-0">Stub File:</span>
                      <span className="font-mono text-foreground break-all">{file.stubFileName}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
