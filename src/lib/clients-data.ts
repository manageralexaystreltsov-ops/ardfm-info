import { assetPath } from "@/lib/base-path";
import type { ClientPayoutRecord } from "@/lib/client-payouts";
import {
  mapStatusToPayout,
  normalizeClientStatus,
  STATUS_OPTIONS,
  STATUS_GROUPS,
  type ClientStatus,
  type CanonicalClientStatus,
} from "@/lib/case-statuses";

export type { ClientStatus, CanonicalClientStatus };
export { STATUS_OPTIONS, STATUS_GROUPS, mapStatusToPayout, normalizeClientStatus };
export { getStatusMeta, countByPhase, isPaidStatus, payoutBadgeModifier } from "@/lib/case-statuses";
export type AppealType = "credit" | "insurance" | "microfinance" | "investment" | "fraud" | "other";

export interface ClientComment {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface ClientHistoryEntry {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  author: string;
  createdAt: string;
}

export interface ClientRecord {
  id: string;
  caseNumber: string;
  clientName: string;
  iin: string;
  phone: string;
  email: string;
  type: AppealType;
  /** Сумма ущерба */
  amount: number;
  /** Сумма к возврату */
  payoutAmount: number;
  /** Уже выплачено */
  paidAmount: number;
  bank: string;
  status: ClientStatus;
  /** Видно клиенту на сайте */
  regulatorNote: string;
  /** Только для админки */
  internalNote: string;
  comments: ClientComment[];
  history: ClientHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  /** Link back to HERMES CRM (SoT identity) */
  crmClientId?: number;
  coreUserId?: number;
}

export interface ClientsDataFile {
  version: number;
  updatedAt: string;
  clients: ClientRecord[];
}

export const TYPE_OPTIONS: { value: AppealType; label: string }[] = [
  { value: "credit", label: "Кредитный спор" },
  { value: "insurance", label: "Страховой случай" },
  { value: "microfinance", label: "МФО" },
  { value: "investment", label: "Инвестиции" },
  { value: "fraud", label: "Мошенничество" },
  { value: "other", label: "Другое" },
];

export function dataJsonUrl(): string {
  return `${assetPath("/data.json")}?t=${Date.now()}`;
}

export async function fetchClientsData(): Promise<ClientsDataFile> {
  const empty: ClientsDataFile = { version: 1, updatedAt: "", clients: [] };
  if (typeof window === "undefined") return empty;
  try {
    const res = await fetch(dataJsonUrl(), { cache: "no-store" });
    if (!res.ok) return empty;
    const data = (await res.json()) as ClientsDataFile;
    if (!Array.isArray(data.clients)) return empty;
    return data;
  } catch {
    return empty;
  }
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function clientToPayoutRecord(client: ClientRecord): ClientPayoutRecord {
  const amountKzt = client.payoutAmount > 0 ? client.payoutAmount : client.amount;
  const paidKzt = client.paidAmount;
  return {
    caseNumber: client.caseNumber,
    clientName: client.clientName,
    iin: client.iin || "",
    phone: client.phone,
    amountKzt,
    paidKzt,
    balanceKzt: Math.max(0, amountKzt - paidKzt),
    status: mapStatusToPayout(client.status),
    bank: client.bank || "—",
    updatedAt: client.updatedAt.slice(0, 10),
    statusNote: client.regulatorNote.trim() || undefined,
  };
}

export function findClientByQuery(
  query: string,
  clients: ClientRecord[],
): ClientRecord | null {
  const q = query.trim();
  if (!q) return null;

  const upper = q.toUpperCase();
  const byCase = clients.find((c) => c.caseNumber.toUpperCase() === upper);
  if (byCase) return byCase;

  const iinDigits = normalizeDigits(q);
  if (iinDigits.length === 12) {
    const byIin = clients.find((c) => normalizeDigits(c.iin) === iinDigits);
    if (byIin) return byIin;
  }

  const phoneDigits = normalizeDigits(q);
  if (phoneDigits.length >= 10) {
    const byPhone = clients.find((c) => {
      const d = normalizeDigits(c.phone);
      return d.endsWith(phoneDigits.slice(-10)) || d.includes(phoneDigits);
    });
    if (byPhone) return byPhone;
  }

  const lower = q.toLowerCase();
  const byName = clients.find((c) => c.clientName.toLowerCase().includes(lower));
  if (byName) return byName;

  const tokens = lower.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length >= 2) {
    return (
      clients.find((c) => {
        const name = c.clientName.toLowerCase();
        return tokens.every((t) => name.includes(t));
      }) ?? null
    );
  }
  return null;
}

export function suggestNextCaseNumber(clients: ClientRecord[]): string {
  const taken = new Set(clients.map((c) => c.caseNumber.trim().toUpperCase()));
  for (let i = 1; i <= 9999; i++) {
    const cn = `FCA-2026-${String(i).padStart(4, "0")}`;
    if (!taken.has(cn)) return cn;
  }
  return `KZ-${Date.now().toString().slice(-5)}`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function formatCurrency(n: number): string {
  return n.toLocaleString("ru-RU") + " ₸";
}

export function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}
