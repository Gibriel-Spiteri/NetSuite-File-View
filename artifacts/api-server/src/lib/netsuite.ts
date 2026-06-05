import jwt from "jsonwebtoken";
import { logger } from "./logger";

const NETSUITE_TOKEN_URL_TEMPLATE =
  "https://{accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token";
const NETSUITE_SUITEQL_URL_TEMPLATE =
  "https://{accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql";
const NETSUITE_RESTLET_URL_TEMPLATE =
  "https://{accountId}.restlets.api.netsuite.com/app/site/hosting/restlet.nl";

function getAccountId(): string {
  const raw = process.env.NETSUITE_ACCOUNT_ID;
  if (!raw) throw new Error("NETSUITE_ACCOUNT_ID environment variable is not set");
  let id = raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  id = id
    .replace(/\.app\.netsuite\.com.*/i, "")
    .replace(/\.suitetalk\.api\.netsuite\.com.*/i, "");
  return id.toLowerCase().replace(/_/g, "-");
}

function buildUrl(template: string): string {
  return template.replace("{accountId}", getAccountId());
}

function normalizePem(raw: string): string {
  let pem = raw.replace(/\\n/g, "\n");
  if (!pem.includes("\n")) {
    pem = pem
      .replace(/(-----BEGIN [^-]+-----)/, "$1\n")
      .replace(/(-----END [^-]+-----)/, "\n$1");
    const headerMatch = pem.match(/^(-----BEGIN [^-]+-----\n)([\s\S]+?)(\n-----END [^-]+-----)$/);
    if (headerMatch) {
      const body = headerMatch[2].replace(/\s+/g, "");
      const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
      pem = `${headerMatch[1]}${lines}${headerMatch[3]}`;
    }
  }
  return pem.trim();
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.NETSUITE_CLIENT_ID;
  const certId = process.env.NETSUITE_CERTIFICATE_ID;
  const privateKeyPem = process.env.NETSUITE_PRIVATE_KEY_PEM;

  if (!clientId || !certId || !privateKeyPem) {
    throw new Error(
      "NetSuite credentials not configured. Set NETSUITE_ACCOUNT_ID, NETSUITE_CLIENT_ID, NETSUITE_CERTIFICATE_ID, and NETSUITE_PRIVATE_KEY_PEM."
    );
  }

  const tokenUrl = buildUrl(NETSUITE_TOKEN_URL_TEMPLATE);
  const issuedAt = Math.floor(now / 1000);

  const assertion = jwt.sign(
    {
      iss: clientId,
      scope: ["rest_webservices", "restlets"],
      aud: tokenUrl,
      iat: issuedAt,
      exp: issuedAt + 3600,
    },
    normalizePem(privateKeyPem),
    {
      algorithm: "PS256",
      header: {
        alg: "PS256",
        typ: "JWT",
        kid: certId,
      },
    }
  );

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
  });

  const response = await fetchWithTimeout(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text }, "NetSuite token request failed");
    throw new Error(`NetSuite auth failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return cachedToken.token;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  { timeoutMs = 90_000, retries = 2 } = {}
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`NetSuite request failed: ${(lastErr as Error)?.message ?? lastErr}`);
}

export function isConfigured(): boolean {
  return !!(
    process.env.NETSUITE_ACCOUNT_ID &&
    process.env.NETSUITE_CLIENT_ID &&
    process.env.NETSUITE_CERTIFICATE_ID &&
    process.env.NETSUITE_PRIVATE_KEY_PEM
  );
}

export function getNetsuiteStatus() {
  const configured = isConfigured();
  let accountId: string | null = null;
  try {
    accountId = configured ? getAccountId() : null;
  } catch {
    accountId = null;
  }
  return {
    configured,
    accountId,
    message: configured
      ? `Connected to account ${accountId}`
      : "NetSuite credentials not configured. Set NETSUITE_ACCOUNT_ID, NETSUITE_CLIENT_ID, NETSUITE_CERTIFICATE_ID, and NETSUITE_PRIVATE_KEY_PEM.",
  };
}

/**
 * Run a SuiteQL query and return all rows (auto-paginates).
 */
async function suiteqlQuery<T>(query: string): Promise<T[]> {
  const token = await getAccessToken();
  const baseUrl = buildUrl(NETSUITE_SUITEQL_URL_TEMPLATE);
  const results: T[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}?limit=${pageSize}&offset=${offset}`;
    const resp = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "transient",
      },
      body: JSON.stringify({ q: query }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SuiteQL error (${resp.status}): ${text}`);
    }

    const data = (await resp.json()) as { items: T[]; hasMore: boolean; totalResults: number };
    results.push(...data.items);
    hasMore = data.hasMore;
    offset += pageSize;
  }

  return results;
}

/**
 * Call a RESTlet with M2M auth.
 */
export async function callRestlet<T>(
  scriptId: string,
  deployId: string,
  params: Record<string, string> = {}
): Promise<T> {
  const token = await getAccessToken();
  const baseUrl = buildUrl(NETSUITE_RESTLET_URL_TEMPLATE);
  const searchParams = new URLSearchParams({ script: scriptId, deploy: deployId, ...params });
  const url = `${baseUrl}?${searchParams}`;

  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`RESTlet error (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<T>;
}

/**
 * Query stub status for files in a given record type by checking the NetSuite
 * file cabinet — looks for .html stubs with matching names.
 * Returns a map of fileId -> hasStub
 */
export async function queryStubStatusForRecordType(
  recordType: string,
  fileIds: string[]
): Promise<Map<string, boolean>> {
  if (fileIds.length === 0) return new Map();

  const idList = fileIds.map((id) => `'${id}'`).join(",");
  const query = `
    SELECT id, name
    FROM file
    WHERE id IN (${idList})
    AND LOWER(name) LIKE '%.html'
  `;

  const rows = await suiteqlQuery<{ id: string; name: string }>(query);
  const stubFileNames = new Set(rows.map((r) => r.name.toLowerCase()));

  logger.info({ recordType, queried: fileIds.length, stubs: stubFileNames.size }, "Stub query complete");

  const result = new Map<string, boolean>();
  for (const id of fileIds) {
    result.set(id, false);
  }

  return result;
}
