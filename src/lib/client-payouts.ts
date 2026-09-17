export type PayoutStatus =
  | "Оплачено"
  | "Ожидает оплату"
  | "Ожидает выплату"
  | "Частично оплачено"
  | "На проверке"
  | "На рассмотрении"
  | "Запрошены документы"
  | "Проверка документов"
  | "Экспертиза"
  | "Направлено в организацию"
  | "Ожидает ответа"
  | "Согласование"
  | "Приостановлено"
  | "Отклонено"
  | "Закрыто";

export type ClientPayoutRecord = {
  caseNumber: string;
  clientName: string;
  iin: string;
  phone: string;
  amountKzt: number;
  paidKzt: number;
  balanceKzt: number;
  status: PayoutStatus;
  bank: string;
  updatedAt: string;
  serviceFeeKzt?: number;
  statusNote?: string;
};

export const REGISTRY_STUB_COUNT = 1250;
/** Decorative registry rows: always look “alive” (0…N days before today). */
export const REGISTRY_STUB_MAX_AGE_DAYS = 7;

const MALE_FIRST_NAMES = [
  "Александр", "Сергей", "Дмитрий", "Руслан", "Ержан", "Нурлан", "Айбек", "Марат", "Тимур", "Асхат",
  "Тельжан", "Бауыржан", "Арман", "Рустем", "Ильяс", "Данияр", "Ермек", "Жасулан", "Канат", "Бекзат",
];
const FEMALE_FIRST_NAMES = [
  "Алина", "Диана", "Сауле", "Айдана", "Жанна", "Виктория", "Екатерина", "Лейла", "Мадина", "Камила",
  "Гульмира", "Асем", "Назгуль", "Динара", "Гульжан", "Айгуль", "Мария", "Ольга", "Людмила", "Зарина",
];
const MALE_LAST_NAMES = [
  "Иванов", "Петров", "Сидоров", "Ахметов", "Жумабаев", "Омаров", "Есенов", "Калиев", "Тлеубердиев", "Нургалиев",
  "Ким", "Смагулов", "Абдрахманов", "Садыков", "Куанышев", "Каратаев", "Мухамеджанов", "Турсунов", "Бекенов", "Сапаров",
];
const FEMALE_LAST_NAMES = [
  "Иванова", "Петрова", "Сидорова", "Ахметова", "Жумабаева", "Омарова", "Есенова", "Калиева", "Тлеубердиева", "Нургалиева",
  "Ким", "Смагулова", "Абдрахманова", "Садыкова", "Куанышева", "Каратаева", "Мухамеджанова", "Турсунова", "Бекенова", "Сапарова",
];
const MALE_MIDDLE_NAMES = [
  "Александрович", "Сергеевич", "Дмитриевич", "Русланович", "Ержанович", "Нурланович", "Айбекович", "Маратович",
  "Тимурович", "Асхатович", "Талгатович", "Бауыржанович", "Арманович", "Рустемович", "Ильясович", "Даниярович",
];
const FEMALE_MIDDLE_NAMES = [
  "Александровна", "Сергеевна", "Дмитриевна", "Руслановна", "Ержановна", "Нурлановна", "Айбековна", "Маратовна",
  "Тимуровна", "Асхатовна", "Талгатовна", "Бауыржановна", "Армановна", "Рустемовна", "Ильясовна", "Данияровна",
];
const BANKS = [
  "Halyk Bank", "Kaspi Bank", "Банк ЦентрКредит", "ForteBank", "Freedom Bank Kazakhstan", "Евразийский Банк",
];

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function makeProfile(rnd: () => number): { first: string; last: string; middle: string } {
  const male = rnd() < 0.52;
  if (male) {
    return {
      first: pick(MALE_FIRST_NAMES, rnd),
      last: pick(MALE_LAST_NAMES, rnd),
      middle: pick(MALE_MIDDLE_NAMES, rnd),
    };
  }
  return {
    first: pick(FEMALE_FIRST_NAMES, rnd),
    last: pick(FEMALE_LAST_NAMES, rnd),
    middle: pick(FEMALE_MIDDLE_NAMES, rnd),
  };
}

function formatDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function makeIin(rnd: () => number): string {
  let s = "";
  for (let i = 0; i < 12; i++) s += String(Math.floor(rnd() * 10));
  return s;
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

const STUB_PAYOUT_STATUSES: PayoutStatus[] = [
  "Оплачено",
  "Ожидает выплату",
  "Ожидает оплату",
  "Частично оплачено",
  "На рассмотрении",
  "На проверке",
  "Запрошены документы",
  "Проверка документов",
  "Экспертиза",
  "Направлено в организацию",
  "Ожидает ответа",
  "Согласование",
  "Приостановлено",
  "Отклонено",
];

function makeStatus(total: number, rnd: () => number): { status: PayoutStatus; paid: number } {
  const status = pick(STUB_PAYOUT_STATUSES, rnd);
  if (status === "Оплачено") return { status, paid: total };
  if (status === "Частично оплачено") {
    const paid = Math.floor(total * (0.2 + rnd() * 0.7));
    return { status, paid };
  }
  return { status, paid: 0 };
}

export function getClientPayouts(total = REGISTRY_STUB_COUNT): ClientPayoutRecord[] {
  const rnd = seeded(24062026);
  const rows: ClientPayoutRecord[] = [];

  for (let i = 1; i <= total; i++) {
    const profile = makeProfile(rnd);
    const amount = 2_000_000 + Math.floor(rnd() * (700_000_000 - 2_000_000 + 1));
    const { status, paid } = makeStatus(amount, rnd);

    rows.push({
      caseNumber: `FCA-2026-${String(i).padStart(4, "0")}`,
      clientName: `${profile.last} ${profile.first} ${profile.middle}`,
      iin: makeIin(rnd),
      phone: `+7 7${String(100 + Math.floor(rnd() * 89))} ${String(100 + Math.floor(rnd() * 899))} ${String(10 + Math.floor(rnd() * 89))} ${String(10 + Math.floor(rnd() * 89))}`,
      amountKzt: amount,
      paidKzt: paid,
      balanceKzt: amount - paid,
      status,
      bank: pick(BANKS, rnd),
      updatedAt: formatDate(Math.floor(rnd() * (REGISTRY_STUB_MAX_AGE_DAYS + 1))),
      statusNote:
        status === "Оплачено"
          ? "Выплата произведена в полном объёме."
          : status === "На проверке" || status === "На рассмотрении"
            ? "Дело в реестре Агентства. Проверка документов."
            : status === "Частично оплачено"
              ? "Часть суммы перечислена, остаток в графике выплат."
              : "Ожидает очереди на перечисление средств.",
    });
  }

  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Следующий свободный номер дела FCA-2026-XXXX (для админки). */
export function suggestNextCaseNumber(existing: string[] = []): string {
  const taken = new Set(existing.map((c) => c.trim().toUpperCase()));
  for (const row of getClientPayouts()) taken.add(row.caseNumber);
  for (let i = 1; i <= 9999; i++) {
    const candidate = `FCA-2026-${String(i).padStart(4, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `FCA-2026-${Date.now().toString().slice(-4)}`;
}

export function findPayoutByQuery(query: string, records?: ClientPayoutRecord[]): ClientPayoutRecord | null {
  const q = query.trim();
  if (!q) return null;
  const all = records ?? getClientPayouts();
  const upper = q.toUpperCase();
  const byCase = all.find((r) => r.caseNumber.toUpperCase() === upper);
  if (byCase) return byCase;

  const iinDigits = normalizeDigits(q);
  if (iinDigits.length === 12) {
    const byIin = all.find((r) => r.iin === iinDigits);
    if (byIin) return byIin;
  }

  if (iinDigits.length >= 10) {
    const byPhone = all.find((r) => {
      const d = normalizeDigits(r.phone);
      return d.endsWith(iinDigits.slice(-10)) || d.includes(iinDigits);
    });
    if (byPhone) return byPhone;
  }

  const lower = q.toLowerCase();
  const byName = all.find((r) => r.clientName.toLowerCase().includes(lower));
  if (byName) return byName;

  const tokens = lower.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length < 2) return null;
  return (
    all.find((r) => {
      const name = r.clientName.toLowerCase();
      return tokens.every((t) => name.includes(t));
    }) ?? null
  );
}

export function findPayoutByCaseNumber(caseNumber: string): ClientPayoutRecord | null {
  return findPayoutByQuery(caseNumber);
}

export function formatKzt(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + " ₸";
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  const country = digits.slice(0, 1);
  const code = digits.slice(1, 4);
  const first = digits.slice(4, 6);
  const last = digits.slice(-2);
  return `+${country} ${code} ${first}** ** ${last}`;
}
