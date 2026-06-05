export function buildNetsuiteUrl(accountId: string, recordType: string, recordId: string): string {
  const host = accountId.toLowerCase().replace(/_/g, "-");
  const base = `https://${host}.app.netsuite.com`;

  const txMap: Record<string, string> = {
    salesorder: "salesord",
    invoice: "custinvc",
    estimate: "estimate",
    cashsale: "cashsale",
    cashrefund: "cashrefund",
    itemfulfillment: "itemship",
    purchaseorder: "purchord",
    vendorbill: "vendbill",
    vendorcredit: "vendcred",
    creditmemo: "custcred",
    itemreceipt: "itemrcpt",
    expensereport: "exprept",
    journalentry: "journal",
    returnauthorization: "returnauth",
    opportunity: "opprtnty",
    quote: "estimate",
  };

  const type = recordType.toLowerCase();

  if (txMap[type]) {
    return `${base}/app/accounting/transactions/${txMap[type]}.nl?id=${recordId}`;
  }
  if (type === "campaign") {
    return `${base}/app/crm/marketing/campaign.nl?id=${recordId}`;
  }
  if (type === "phonecall") {
    return `${base}/app/crm/calendar/call.nl?id=${recordId}`;
  }
  if (type === "task") {
    return `${base}/app/crm/calendar/task.nl?id=${recordId}`;
  }
  if (type === "customer" || type === "lead" || type === "prospect") {
    return `${base}/app/common/entity/custjob.nl?id=${recordId}`;
  }
  if (type === "vendor") {
    return `${base}/app/common/entity/vendor.nl?id=${recordId}`;
  }
  if (type === "employee") {
    return `${base}/app/common/entity/employee.nl?id=${recordId}`;
  }
  if (type === "contact") {
    return `${base}/app/common/entity/contact.nl?id=${recordId}`;
  }
  if (type.startsWith("customrecord")) {
    return `${base}/app/common/custom/customrecordentry.nl?id=${recordId}`;
  }
  return `${base}/app/common/entity/record.nl?id=${recordId}`;
}
