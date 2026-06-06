const RECORD_TYPE_PATHS: Record<string, string> = {
  salesorder:            "/app/accounting/transactions/salesord.nl",
  invoice:               "/app/accounting/transactions/custinvc.nl",
  itemfulfillment:       "/app/accounting/transactions/itemship.nl",
  itemreceipt:           "/app/accounting/transactions/itemrcpt.nl",
  estimate:              "/app/accounting/transactions/estimate.nl",
  returnauthorization:   "/app/accounting/transactions/rtnauth.nl",
  creditmemo:            "/app/accounting/transactions/custcred.nl",
  purchaseorder:         "/app/accounting/transactions/purchord.nl",
  cashsale:              "/app/accounting/transactions/cashsale.nl",
  cashrefund:            "/app/accounting/transactions/cashrefund.nl",
  check:                 "/app/accounting/transactions/check.nl",
  journalentry:          "/app/accounting/transactions/journal.nl",
  vendorbill:            "/app/accounting/transactions/vendbill.nl",
  vendorcredit:          "/app/accounting/transactions/vendcred.nl",
  expensereport:         "/app/accounting/transactions/exprept.nl",
  opportunity:           "/app/crm/sales/opportunity.nl",
  quote:                 "/app/accounting/transactions/estimate.nl",
  task:                  "/app/crm/calendar/task.nl",
  phonecall:             "/app/crm/calendar/call.nl",
  event:                 "/app/crm/calendar/event.nl",
  supportcase:           "/app/crm/support/supportcase.nl",
  contact:               "/app/common/entity/contact.nl",
  customer:              "/app/common/entity/custjob.nl",
  lead:                  "/app/common/entity/custjob.nl",
  prospect:              "/app/common/entity/custjob.nl",
  vendor:                "/app/common/entity/vendor.nl",
  employee:              "/app/common/entity/employee.nl",
  partner:               "/app/common/entity/partner.nl",
  project:               "/app/accounting/project/project.nl",
  projecttask:           "/app/accounting/project/projecttask.nl",
  inventoryadjustment:   "/app/accounting/transactions/invadjst.nl",
  transferorder:         "/app/accounting/transactions/xferord.nl",
  workorder:             "/app/accounting/transactions/workord.nl",
  assemblyunbuild:       "/app/accounting/transactions/asmunbld.nl",
  assemblybuild:         "/app/accounting/transactions/assemblybuild.nl",
  campaign:              "/app/crm/marketing/campaign.nl",
};

export function nsRecordUrl(
  accountId: string,
  recordType: string,
  recordId: string,
): string {
  const base = `https://${accountId}.app.netsuite.com`;
  const path = RECORD_TYPE_PATHS[recordType.toLowerCase()];
  if (path) return `${base}${path}?id=${encodeURIComponent(recordId)}`;
  // Custom records or unrecognised types — link to a global search
  return `${base}/app/common/search/search.nl?searchtype=Transaction&id=${encodeURIComponent(recordId)}`;
}
