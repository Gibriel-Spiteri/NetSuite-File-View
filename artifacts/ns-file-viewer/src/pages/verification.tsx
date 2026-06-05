import { useState } from "react";
import { useGetVerificationItems, useListRecordTypes, useGetNetsuiteStatus } from "@workspace/api-client-react";
import type { GetVerificationItemsParams } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { buildNetsuiteUrl } from "@/lib/netsuite";

export function Verification() {
  const [params, setParams] = useState<GetVerificationItemsParams>({ limit: 2000, offset: 0 });

  const { data, isLoading } = useGetVerificationItems(params);
  const { data: recordTypes } = useListRecordTypes();
  const { data: nsStatus } = useGetNetsuiteStatus();
  const accountId = nsStatus?.accountId || undefined;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    (acc[item.recordType] ??= []).push(item);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select
            value={params.recordType || "all"}
            onValueChange={v => setParams(p => ({ ...p, recordType: v === "all" ? undefined : v, offset: 0 }))}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All Record Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Record Types</SelectItem>
              {recordTypes?.filter(t => t.missingStubCount > 0).map(t => (
                <SelectItem key={t.recordType} value={t.recordType}>
                  {t.recordType} ({t.missingStubCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isLoading && (
          <span className="text-sm text-muted-foreground">
            {total.toLocaleString()} file{total !== 1 ? "s" : ""} need a stub
          </span>
        )}
      </div>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Loading verification data...</CardContent></Card>
      ) : total === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">All files have stubs — nothing to verify.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {groupKeys.map(type => (
            <Card key={type}>
              <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">{type}</Badge>
                  <span className="text-sm text-muted-foreground">{grouped[type].length} file{grouped[type].length !== 1 ? "s" : ""} missing stub</span>
                </div>
              </div>
              <div className="divide-y">
                {grouped[type].map((item, idx) => (
                  <div key={`${item.recordId}-${item.fileId}-${idx}`} className="px-4 py-3 flex items-start gap-4 hover:bg-muted/20 transition-colors">
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-1">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground font-medium mb-0.5">Record</div>
                        <div className="font-medium text-sm truncate" title={item.recordName || item.recordId}>
                          {item.recordName || <span className="text-muted-foreground italic">no name</span>}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{item.recordId}</div>
                        {item.recordStatus && (
                          <div className="text-xs text-muted-foreground mt-0.5">{item.recordStatus}</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground font-medium mb-0.5">File</div>
                        <div className="font-medium text-sm truncate" title={item.fileName}>{item.fileName}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{item.fileId}</span>
                          <span className="mx-1">·</span>
                          <span>{(item.sizeBytes / 1024).toFixed(1)} KB</span>
                          <span className="mx-1">·</span>
                          <span>{item.fileType}</span>
                        </div>
                      </div>
                    </div>
                    {accountId && (
                      <a
                        href={buildNetsuiteUrl(accountId, item.recordType, item.recordId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open record ${item.recordId} in NetSuite`}
                      >
                        <Button variant="outline" size="sm" className="gap-1.5 shrink-0 whitespace-nowrap">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open Record
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
