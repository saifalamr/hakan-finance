export type TransactionType = "income" | "expense" | "adjustment";
export type PayrollKind = "salary_payment" | "advance" | "bonus" | "deduction";
export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: "income" | "expense";
};
export type Vehicle = {
  id: string;
  user_id: string;
  plate: string;
  brand: string;
  model: string;
};
export type Employee = {
  id: string;
  user_id: string;
  name: string;
  salary: number;
  work_days: number;
};
export type PayrollPeriod = {
  id: string;
  user_id: string;
  employee_id: string;
  month: string;
  salary: number;
  work_days: number;
};
export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  category_id: string | null;
  date: string;
  description: string;
  vehicle_id: string | null;
  employee_id: string | null;
  payroll_kind: PayrollKind | null;
  created_at: string;
};
export type Data = {
  transactions: Transaction[];
  vehicles: Vehicle[];
  employees: Employee[];
  categories: Category[];
  employee_periods: PayrollPeriod[];
};
export const emptyData: Data = {
  transactions: [],
  vehicles: [],
  employees: [],
  categories: [],
  employee_periods: [],
};
export const payrollLabels: Record<PayrollKind, string> = {
  salary_payment: "Maaş ödemesi",
  advance: "Avans",
  bonus: "Ek ödeme",
  deduction: "Kesinti",
};
export const money = (cents: number) =>
  "₺" +
  (cents / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const compactMoney = (cents: number) =>
  "₺" +
  (cents / 100).toLocaleString("tr-TR", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
export function parseMoney(value: string): number {
  const raw = value.trim().replace(/₺|\s/g, "");
  let normalized: string;
  if (
    /^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(raw) ||
    /^\d+(,\d{1,2})?$/.test(raw)
  )
    normalized = raw.replaceAll(".", "").replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(raw)) normalized = raw;
  else throw new Error("Geçerli bir tutar girin. Örnek: 2.500,50");
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 999999999999)
    throw new Error("Tutar 0’dan büyük ve 10 milyar TL’den küçük olmalı.");
  return cents;
}
export const inputMoney = (cents: number) =>
  (cents / 100).toLocaleString("tr-TR", {
    useGrouping: false,
    maximumFractionDigits: 2,
  });
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const currentMonth = () => today().slice(0, 7);
export const dateLabel = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
export const monthLabel = (value: string) =>
  new Date(value + "-01T12:00:00").toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
  });
export function shiftMonth(month: string, offset: number) {
  const date = new Date(month + "-01T12:00:00");
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
export const inMonth = (transactions: Transaction[], month: string) =>
  transactions.filter((t) => t.date.startsWith(month));
export function totals(transactions: Transaction[]) {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((a, t) => a + t.amount, 0);
  const expense = transactions
    .filter((t) => t.type === "expense")
    .reduce((a, t) => a + t.amount, 0);
  return { income, expense, net: income - expense };
}
export function payrollSummary(
  period: PayrollPeriod | undefined,
  transactions: Transaction[],
) {
  const sum = (kind: PayrollKind) =>
    transactions
      .filter((t) => t.payroll_kind === kind)
      .reduce((a, t) => a + t.amount, 0);
  const salary = period
    ? Math.round((period.salary * period.work_days) / 30)
    : 0;
  const advance = sum("advance"),
    salaryPayment = sum("salary_payment"),
    bonus = sum("bonus"),
    deduction = sum("deduction");
  // Bonus is both an earned addition and a completed cash payment. Deduction has no cash effect.
  const earned = salary + bonus - deduction,
    paid = advance + salaryPayment + bonus;
  return {
    salary,
    advance,
    salaryPayment,
    bonus,
    deduction,
    earned,
    paid,
    remaining: earned - paid,
  };
}
export function breakdown(
  transactions: Transaction[],
  key: "category_id" | "vehicle_id" | "employee_id",
  names: Record<string, string>,
) {
  const groups = new Map<string, number>();
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const id = t[key] || "none";
      groups.set(id, (groups.get(id) || 0) + t.amount);
    });
  return [...groups]
    .map(([id, value]) => ({ name: names[id] || "Diğer", value }))
    .sort((a, b) => b.value - a.value);
}
export function dailyChart(transactions: Transaction[], month: string) {
  const days = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  return Array.from({ length: days }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    const total = totals(
      transactions.filter((t) => t.date === `${month}-${day}`),
    );
    return {
      day: String(i + 1),
      Gelir: total.income / 100,
      Gider: total.expense / 100,
    };
  });
}
export type DateFilter = "today" | "week" | "month" | "custom";
export function filterDates(
  transactions: Transaction[],
  filter: DateFilter,
  start: string,
  end: string,
) {
  const now = today();
  const monday = new Date(now + "T12:00:00");
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  return transactions.filter((t) =>
    filter === "today"
      ? t.date === now
      : filter === "week"
        ? t.date >= weekStart && t.date <= now
        : filter === "month"
          ? t.date.startsWith(currentMonth())
          : t.date >= start && t.date <= end,
  );
}
