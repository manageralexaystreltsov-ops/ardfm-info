"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { payoutBadgeModifier } from "@/lib/case-statuses";
import { clientToPayoutRecord } from "@/lib/clients-data";
import { loadClientsMerged } from "@/lib/clients-persistence";
import { NextStepsBlock } from "@/components/NextStepsBlock";
import { PayoutCaseCard } from "@/components/PayoutCaseCard";
import {
  findPayoutByQuery,
  formatKzt,
  getClientPayouts,
  mergePayoutRegistry,
  maskPhone,
  REGISTRY_STUB_COUNT,
  type ClientPayoutRecord,
} from "@/lib/client-payouts";

const STATUS_CLASS: Record<string, string> = {
  "Оплачено": "paid",
  "Ожидает оплату": "pending",
  "Частично оплачено": "partial",
  "На проверке": "review",
  "На рассмотрении": "review",
};

const REGISTRY_STEPS = [
  "Подключение к реестру обращений…",
  "Сверка идентификаторов в базах данных…",
  "Проверка статуса выплат и обременений…",
  "Формирование карточки дела…",
] as const;

const PAGE_SIZE = 40;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ClientPayoutsPage() {
  const stubs = useMemo(() => getClientPayouts(REGISTRY_STUB_COUNT), []);
  const [crmPayouts, setCrmPayouts] = useState<ClientPayoutRecord[]>([]);

  useEffect(() => {
    loadClientsMerged().then((data) => {
      setCrmPayouts(data.clients.map(clientToPayoutRecord));
    });
  }, []);

  const registry = useMemo(() => {
    return mergePayoutRegistry(crmPayouts, stubs);
  }, [stubs, crmPayouts]);

  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchStep, setSearchStep] = useState(0);
  const [result, setResult] = useState<ClientPayoutRecord | null>(null);
  const [openCase, setOpenCase] = useState<ClientPayoutRecord | null>(null);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(registry.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return registry.slice(start, start + PAGE_SIZE);
  }, [registry, page]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      setSearching(true);
      setSearched(trimmed);
      setResult(null);
      setOpenCase(null);

      for (let i = 0; i < REGISTRY_STEPS.length; i++) {
        setSearchStep(i);
        await delay(700 + i * 150);
      }

      const found = findPayoutByQuery(trimmed, registry);
      setResult(found);
      setSearching(false);
      if (found) setOpenCase(found);
    },
    [registry],
  );

  const openCaseFromTable = (row: ClientPayoutRecord) => {
    setOpenCase(row);
    setResult(row);
    setSearched(row.caseNumber);
  };

  return (
    <div>
      <div className="pg-page-header">
        <div className="pg-page-header-inner">
          <div className="pg-breadcrumb">
            <Link href="/">Главная</Link>
            <span className="pg-breadcrumb-sep">/</span>
            <span>Выплаты клиентам</span>
          </div>
          <h1 className="pg-page-title">Проверить статус обращения</h1>
          <p className="pg-page-desc">
            Найдите себя по фамилии, телефону, ИИН или номеру дела. В общем списке
            записи упорядочены по планируемой дате выплаты — выше значит раньше.
          </p>
        </div>
      </div>

      <div className="container-main" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div className="payout-registry-banner" aria-live="polite">
          <span className="payout-registry-banner__pulse" aria-hidden="true" />
          <div>
            <strong>Государственный реестр выплат</strong>
            <p>Актуальные данные по обращениям и статусам выплат</p>
          </div>
        </div>

        <section style={{ marginBottom: "2rem" }} aria-label="Проверка статуса">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "1.5rem",
              }}
            >
              <label
                htmlFor="payout-query"
                style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}
              >
                Номер дела, фамилия, телефон или ИИН
              </label>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <input
                  id="payout-query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Например: Нурбаев / +7700… / 12 цифр ИИН"
                  autoComplete="off"
                  className="pg-form-input"
                  style={{ minWidth: 280, flex: 1 }}
                  disabled={searching}
                />
                <button type="submit" className="pg-btn pg-btn-primary" disabled={searching || !query.trim()}>
                  {searching ? "Поиск…" : "Проверить"}
                </button>
              </div>
            </div>
          </form>

          {searching && (
            <div className="payout-registry-scan" aria-live="polite" aria-busy="true">
              <div className="payout-registry-scan__spinner" aria-hidden="true" />
              <div className="payout-registry-scan__body">
                <p className="payout-registry-scan__title">Запрос в реестрах</p>
                <ul className="payout-registry-scan__steps">
                  {REGISTRY_STEPS.map((step, i) => (
                    <li
                      key={step}
                      className={
                        i < searchStep
                          ? "done"
                          : i === searchStep
                            ? "active"
                            : ""
                      }
                    >
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!searching && searched && !result && (
            <div className="payout-search-empty">
              <p>
                По запросу <strong>{searched}</strong> в реестре ничего не найдено. Проверьте номер дела,
                ИИН или ФИО и повторите поиск.
              </p>
            </div>
          )}
        </section>

        <section>
          <div className="payout-table-toolbar">
            <h2 style={{ fontSize: "1.2rem", margin: 0, color: "var(--color-navy-800)" }}>
              Реестр выплат
            </h2>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
              Сортировка по планируемой дате выплаты (раньше — выше). Реальные дела смешаны с общим реестром.
              Ищите себя по фамилии, телефону или ИИН.
            </p>
          </div>

          <div className="pg-table-wrap">
            <table className="pg-table payout-table payout-table--clickable" dir="ltr">
              <thead>
                <tr>
                  <th>Номер дела</th>
                  <th>ФИО клиента</th>
                  <th>Телефон</th>
                  <th style={{ textAlign: "right" }}>Сумма</th>
                  <th style={{ textAlign: "right" }}>Оплачено</th>
                  <th style={{ textAlign: "right" }}>Остаток</th>
                  <th>Статус</th>
                  <th>Банк</th>
                  <th>План выплаты</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.caseNumber}
                    className={openCase?.caseNumber === row.caseNumber ? "payout-row--active" : ""}
                    onClick={() => openCaseFromTable(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openCaseFromTable(row);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Открыть дело ${row.caseNumber}`}
                  >
                    <td style={{ fontWeight: 600, fontFamily: "monospace", fontSize: "0.82rem" }}>
                      {row.caseNumber}
                    </td>
                    <td>{row.clientName}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.82rem", letterSpacing: "0.02em" }}>
                      {maskPhone(row.phone)}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontFeatureSettings: "'tnum' 1" }}>
                      {formatKzt(row.amountKzt)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color: "#1a7f46",
                        fontFeatureSettings: "'tnum' 1",
                      }}
                    >
                      {formatKzt(row.paidKzt)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color: row.balanceKzt > 0 ? "#c62828" : "inherit",
                        fontFeatureSettings: "'tnum' 1",
                      }}
                    >
                      {formatKzt(row.balanceKzt)}
                    </td>
                    <td>
                      <span className={`payout-badge ${payoutBadgeModifier(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>{row.bank}</td>
                    <td style={{ fontSize: "0.82rem" }}>{row.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pg-pagination payout-pagination">
              <button
                type="button"
                className="pg-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ←
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let n: number;
                if (totalPages <= 7) n = i + 1;
                else if (page <= 4) n = i + 1;
                else if (page >= totalPages - 3) n = totalPages - 6 + i;
                else n = page - 3 + i;
                return (
                  <button
                    key={n}
                    type="button"
                    className={`pg-page-btn ${page === n ? "active" : ""}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                );
              })}
              <button
                type="button"
                className="pg-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                →
              </button>
            </div>
          )}
        </section>

        <NextStepsBlock pathname="/client-payouts" />
      </div>

      {openCase && <PayoutCaseCard record={openCase} onClose={() => setOpenCase(null)} />}
    </div>
  );
}
