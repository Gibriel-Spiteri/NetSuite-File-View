import { useState, useMemo } from "react";
import { useGetVerificationItems, useGetNetsuiteStatus } from "@workspace/api-client-react";
import type { VerificationItem } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, ChevronDown, ChevronRight, CheckCircle2, Circle, FileX } from "lucide-react";
import { buildNetsuiteUrl } from "@/lib/netsuite";

type RecordGroup = {
  recordId: string;
  recordName: string;
  recordStatus: string;
  files: VerificationItem[];
};

type TypeGroup = {
  type: string;
  records: RecordGroup[];
  totalFiles: number;
};

function useReviewedState() {
  const [reviewed, setReviewed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("verification-reviewed");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  function markReviewed(recordId: string) {
    setReviewed((prev) => {
      const next = new Set(prev);
      next.add(recordId);
      try { localStorage.setItem("verification-reviewed", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function unmarkReviewed(recordId: string) {
    setReviewed((prev) => {
      const next = new Set(prev);
      next.delete(recordId);
      try { localStorage.setItem("verification-reviewed", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  return { reviewed, markReviewed, unmarkReviewed };
}

export function Verification() {
  const { data, isLoading } = useGetVerificationItems({ limit: 2000, offset: 0 });
  const { data: nsStatus } = useGetNetsuiteStatus();
  const accountId = nsStatus?.accountId || undefined;
  const { reviewed, markReviewed, unmarkReviewed } = useReviewedState();
  const [expandedType, setExpandedType] = useState<string | null>(null);

  const typeGroups = useMemo<TypeGroup[]>(() => {
    if (!data?.items) return [];
    const map = new Map<string, Map<string, RecordGroup>>();
    for (const item of data.items) {
      if (!map.has(item.recordType)) map.set(item.recordType, new Map());
      const records = map.get(item.recordType)!;
      if (!records.has(item.recordId)) {
        records.set(item.recordId, { recordId: item.recordId, recordName: item.recordName, recordStatus: item.recordStatus, files: [] });
      }
      records.get(item.recordId)!.files.push(item);
    }
    return Array.from(map.entries())
      .map(([type, records]) => ({ type, records: Array.from(records.values()), totalFiles: Array.from(records.values()).reduce((n, r) => n + r.files.length, 0) }))
      .sort((a, b) => b.totalFiles - a.totalFiles);
  }, [data]);

  const totalRecords = useMemo(() => typeGroups.reduce((n, g) => n + g.records.length, 0), [typeGroups]);
  const reviewedCount = useMemo(() => typeGroups.reduce((n, g) => n + g.records.filter(r => reviewed.has(r.recordId)).length, 0), [typeGroups, reviewed]);
  const totalFiles = data?.total ?? 0;
  const remainingRecords = totalRecords - reviewedCount;

  if (isLoading) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">Loading verification data...</CardContent></Card>;
  }

  if (typeGroups.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <div className="font-medium text-lg">All files have stubs — nothing to verify.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Types Affected" value={typeGroups.length} />
        <SummaryCard label="Records to Review" value={remainingRecords} highlight={remainingRecords > 0} />
        <SummaryCard label="Files Missing Stubs" value={totalFiles} />
        <SummaryCard label="Reviewed" value={reviewedCount} suffix={`/ ${totalRecords}`} positive />
      </div>

      {/* Type Accordion */}
      <div className="space-y-2">
        {typeGroups.map((group) => {
          const reviewedInType = group.records.filter((r) => reviewed.has(r.recordId)).length;
          const pendingInType = group.records.length - reviewedInType;
          const isOpen = expandedType === group.type;
          const pct = group.records.length > 0 ? (reviewedInType / group.records.length) * 100 : 0;

          return (
            <Card key={group.type} className={isOpen ? "ring-1 ring-primary/30" : ""}>
              {/* Card Header — always visible */}
              <button
                className="w-full px-4 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors rounded-t-lg text-left"
                onClick={() => setExpandedType(isOpen ? null : group.type)}
              >
                <div className="flex items-center gap-2 min-w-[180px]">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <Badge variant="outline" className="font-mono text-xs">{group.type}</Badge>
                </div>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    <span className="font-medium text-foreground">{group.records.length}</span> records ·{" "}
                    <span className="font-medium text-foreground">{group.totalFiles}</span> files
                  </div>
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="flex-1 max-w-[200px] h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {reviewedInType}/{group.records.length} reviewed
                    </span>
                  </div>
                </div>
                {pendingInType > 0 ? (
                  <Badge variant="destructive" className="text-xs shrink-0">{pendingInType} pending</Badge>
                ) : (
                  <Badge className="text-xs bg-emerald-500 shrink-0">Done</Badge>
                )}
              </button>

              {/* Expanded Record List */}
              {isOpen && (
                <div className="border-t">
                  <Tabs defaultValue="pending" className="w-full">
                    <div className="px-4 pt-3">
                      <TabsList className="h-8">
                        <TabsTrigger value="pending" className="text-xs px-3">
                          To Review
                          {pendingInType > 0 && <span className="ml-1.5 text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5 py-0">{pendingInType}</span>}
                        </TabsTrigger>
                        <TabsTrigger value="reviewed" className="text-xs px-3">
                          Reviewed
                          {reviewedInType > 0 && <span className="ml-1.5 text-[10px] bg-emerald-500 text-white rounded-full px-1.5 py-0">{reviewedInType}</span>}
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="pending" className="mt-0">
                      {group.records.filter((r) => !reviewed.has(r.recordId)).length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">
                          <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                          All records in this type have been reviewed.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {group.records
                            .filter((r) => !reviewed.has(r.recordId))
                            .map((record) => (
                              <RecordRow
                                key={record.recordId}
                                record={record}
                                accountId={accountId}
                                recordType={group.type}
                                isReviewed={false}
                                onToggle={() => markReviewed(record.recordId)}
                              />
                            ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="reviewed" className="mt-0">
                      {group.records.filter((r) => reviewed.has(r.recordId)).length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">No records reviewed yet.</div>
                      ) : (
                        <div className="divide-y">
                          {group.records
                            .filter((r) => reviewed.has(r.recordId))
                            .map((record) => (
                              <RecordRow
                                key={record.recordId}
                                record={record}
                                accountId={accountId}
                                recordType={group.type}
                                isReviewed={true}
                                onToggle={() => unmarkReviewed(record.recordId)}
                              />
                            ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, suffix, highlight, positive }: {
  label: string; value: number; suffix?: string; highlight?: boolean; positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{label}</div>
        <div className={`text-2xl font-bold ${highlight ? "text-destructive" : positive && value > 0 ? "text-emerald-600" : "text-foreground"}`}>
          {value.toLocaleString()}
          {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function RecordRow({
  record, accountId, recordType, isReviewed, onToggle,
}: {
  record: RecordGroup;
  accountId: string | undefined;
  recordType: string;
  isReviewed: boolean;
  onToggle: () => void;
}) {
  const [filesOpen, setFilesOpen] = useState(false);
  const nsUrl = accountId ? buildNetsuiteUrl(accountId, recordType, record.recordId) : null;

  return (
    <div className={`px-4 py-3 ${isReviewed ? "bg-muted/20" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Reviewed toggle */}
        <button
          onClick={onToggle}
          className={`mt-0.5 shrink-0 transition-colors ${isReviewed ? "text-emerald-500 hover:text-muted-foreground" : "text-muted-foreground/40 hover:text-emerald-500"}`}
          title={isReviewed ? "Mark as not reviewed" : "Mark as reviewed"}
        >
          {isReviewed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
        </button>

        {/* Record info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium text-sm ${isReviewed ? "text-muted-foreground line-through" : ""}`}>
              {record.recordName || <span className="italic text-muted-foreground">no name</span>}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{record.recordId}</span>
          </div>
          {record.recordStatus && (
            <div className="text-xs text-muted-foreground mt-0.5">{record.recordStatus}</div>
          )}
          <button
            className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setFilesOpen((v) => !v)}
          >
            <FileX className="h-3 w-3" />
            {record.files.length} file{record.files.length !== 1 ? "s" : ""} missing stub
            {filesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {filesOpen && (
            <ul className="mt-2 space-y-1 pl-1">
              {record.files.map((f) => (
                <li key={f.fileId} className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 font-mono flex gap-2">
                  <span className="truncate flex-1" title={f.fileName}>{f.fileName}</span>
                  <span className="shrink-0 text-muted-foreground/60">{f.fileId}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Open in NetSuite */}
        {nsUrl && (
          <a href={nsUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
              <ExternalLink className="h-3.5 w-3.5" />
              Open Record
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
