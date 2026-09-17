/** Bridge: public-site admin → HERMES CRM work-clients (registry token). */

export type CrmWorkClient = {
  crmClientId: number;
  coreUserId: number | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  iin: string | null;
  walletAmount: number;
  walletCurrency: string;
  amountKzt: number;
  workStatus: string;
  suggestedCaseNumber: string;
};

export type CrmBridgeConfig = {
  baseUrl: string;
  token: string;
};

const CONFIG_KEY = "regylz-crm-bridge-config";

export const DEFAULT_CRM_BRIDGE: CrmBridgeConfig = {
  baseUrl: "https://ssrrmm.duckdns.org",
  token: "",
};

export function getCrmBridgeConfig(): CrmBridgeConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CRM_BRIDGE };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CRM_BRIDGE };
    const parsed = JSON.parse(raw) as Partial<CrmBridgeConfig>;
    return {
      baseUrl: (parsed.baseUrl || DEFAULT_CRM_BRIDGE.baseUrl).replace(/\/$/, ""),
      token: parsed.token?.trim() || "",
    };
  } catch {
    return { ...DEFAULT_CRM_BRIDGE };
  }
}

export function saveCrmBridgeConfig(config: CrmBridgeConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      token: config.token.trim(),
    }),
  );
}

export async function fetchCrmWorkClients(
  q = "",
  limit = 80,
  config: CrmBridgeConfig = getCrmBridgeConfig(),
): Promise<{ ok: true; items: CrmWorkClient[]; total: number } | { ok: false; error: string }> {
  if (!config.token.trim()) {
    return {
      ok: false,
      error: "Укажите токен CRM (X-Hermes-Registry-Token) в разделе «Синхронизация GitHub / CRM».",
    };
  }
  const url = new URL("/api/local/registry/work-clients", config.baseUrl);
  if (q.trim()) url.searchParams.set("q", q.trim());
  url.searchParams.set("limit", String(limit));
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Hermes-Registry-Token": config.token.trim(),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `CRM ${res.status}: ${body.slice(0, 160) || res.statusText}`,
      };
    }
    const data = (await res.json()) as {
      items?: CrmWorkClient[];
      total?: number;
    };
    return {
      ok: true,
      items: Array.isArray(data.items) ? data.items : [],
      total: Number(data.total) || 0,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть: не удалось связаться с CRM",
    };
  }
}
