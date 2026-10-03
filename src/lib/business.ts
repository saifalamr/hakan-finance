import {
  type Data,
  type Vehicle,
  type Employee,
  type PayrollPeriod,
  type Transaction,
  totals,
  payrollSummary,
  shiftMonth,
  cashBalance,
  today,
  dailyChart,
  monthLastDate,
} from "./finance";
export type Group = { id: string; name: string; value: number };
export type VehicleSummary = Vehicle & {
  current: number;
  previous: number;
  lifetime: number;
  last_activity: string | null;
  history: { month: string; amount: number }[];
  categories: Group[];
};
export type EmployeeSummary = Employee & {
  period: PayrollPeriod | null;
  earned_salary: number;
  advance: number;
  salary_payment: number;
  bonus: number;
  bonus_due: number;
  deduction: number;
  paid: number;
  remaining: number;
};
export type Snapshot = {
  month: string;
  total: ReturnType<typeof totals>;
  balance: number | null;
  vehicles: VehicleSummary[];
  employees: EmployeeSummary[];
  categories: Group[];
  trend: { month: string; income: number; expense: number }[];
  daily: { day: number; Gelir: number; Gider: number }[];
};
export type Status = "normal" | "attention" | "high" | "neutral";
export const statusLabels: Record<Status, string> = {
  normal: "Normal",
  attention: "Dikkat",
  high: "Yüksek Gider",
  neutral: "Yeterli geçmiş yok",
};
// Compare full monthly totals with the three completed months. No projection of an unfinished month.
// At least two months with spending are required; zero-only history is not a baseline.
export function vehicleStatus(
  vehicle: Pick<VehicleSummary, "current" | "history">,
) {
  const observed = vehicle.history.filter((h) => h.amount > 0);
  if (observed.length < 2)
    return { status: "neutral" as Status, average: null, ratio: null };
  const average =
    observed.reduce((sum, h) => sum + h.amount, 0) / observed.length;
  const ratio = vehicle.current / average;
  return {
    status: (ratio > 1.35
      ? "high"
      : ratio > 1.1
        ? "attention"
        : "normal") as Status,
    average,
    ratio,
  };
}
export function percentChange(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}
export function percentLabel(current: number, previous: number) {
  const n = percentChange(current, previous);
  return n === null
    ? current > 0
      ? "Önceki ay gider yok"
      : "Değişim yok"
    : `${n > 0 ? "+" : ""}%${Math.abs(n).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}${n < 0 ? " azalma" : ""}`;
}
export function employeeStatus(
  e: Pick<EmployeeSummary, "period" | "remaining">,
  month: string,
) {
  if (!e.period) return { status: "neutral" as Status, label: "Plan yok" };
  if (e.remaining < 0)
    return { status: "high" as Status, label: "Fazla ödeme" };
  if (e.remaining === 0)
    return { status: "normal" as Status, label: "Ödeme tamam" };
  if (month < today().slice(0, 7))
    return { status: "high" as Status, label: "Geçmiş ay bakiyesi" };
  return { status: "attention" as Status, label: "Ödeme bekliyor" };
}
export const monthEnd = monthLastDate;
export function nextRecurringDate(
  due: string,
  frequency: "weekly" | "monthly" | "yearly",
  anchorDay: number,
  anchorMonth: number,
) {
  if (frequency === "weekly") {
    const d = new Date(due + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const month =
    frequency === "monthly"
      ? shiftMonth(due.slice(0, 7), 1)
      : `${Number(due.slice(0, 4)) + 1}-${String(anchorMonth).padStart(2, "0")}`;
  return `${month}-${String(Math.min(anchorDay, Number(monthEnd(month).slice(8)))).padStart(2, "0")}`;
}
// Development/demo and compatibility only. Production uses finance_summary with identical kuruş formulas.
export function localSnapshot(data: Data, month: string): Snapshot {
  const active = data.transactions.filter((t) => !t.deleted_at),
    monthly = active.filter((t) => t.date.startsWith(month));
  const group = (tx: Transaction[]) => {
    const map = new Map<string, number>();
    for (const t of tx)
      if (t.type === "expense")
        map.set(
          t.category_id || "none",
          (map.get(t.category_id || "none") || 0) + t.amount,
        );
    return [...map]
      .map(([id, value]) => ({
        id,
        value,
        name: data.categories.find((c) => c.id === id)?.name || "Diğer",
      }))
      .sort((a, b) => b.value - a.value);
  };
  const byVehicle = new Map<string, Transaction[]>(),
    byEmployee = new Map<string, Transaction[]>();
  for (const t of active) {
    for (const [id, map] of [
      [t.vehicle_id, byVehicle],
      [t.employee_id, byEmployee],
    ] as const) {
      if (id) {
        const bucket = map.get(id);
        if (bucket) bucket.push(t);
        else map.set(id, [t]);
      }
    }
  }
  return {
    month,
    total: totals(monthly),
    balance: cashBalance(data.finance_settings?.[0], active),
    vehicles: data.vehicles.map((v) => {
      const tx = (byVehicle.get(v.id) || []).filter(
        (t) => t.type === "expense",
      );
      const current = tx.filter((t) => t.date.startsWith(month));
      return {
        ...v,
        current: totals(current).expense,
        previous: totals(
          tx.filter((t) => t.date.startsWith(shiftMonth(month, -1))),
        ).expense,
        lifetime: totals(tx).expense,
        last_activity: (byVehicle.get(v.id) || []).reduce<string | null>(
          (a, t) => (!a || t.date > a ? t.date : a),
          null,
        ),
        history: [-3, -2, -1].map((i) => ({
          month: shiftMonth(month, i),
          amount: totals(
            tx.filter((t) => t.date.startsWith(shiftMonth(month, i))),
          ).expense,
        })),
        categories: group(current),
      };
    }),
    employees: data.employees.map((e) => {
      const period =
        data.employee_periods.find(
          (p) => p.employee_id === e.id && p.month === month + "-01",
        ) || null;
      const s = payrollSummary(
        period || undefined,
        (byEmployee.get(e.id) || []).filter((t) => t.date.startsWith(month)),
      );
      return {
        ...e,
        period,
        earned_salary: s.salary,
        advance: s.advance,
        salary_payment: s.salaryPayment,
        bonus: s.bonus,
        bonus_due: s.bonusDue,
        deduction: s.deduction,
        paid: s.paid,
        remaining: s.remaining,
      };
    }),
    categories: group(monthly),
    trend: Array.from({ length: 6 }, (_, i) => {
      const m = shiftMonth(month, i - 5);
      const total = totals(active.filter((t) => t.date.startsWith(m)));
      return { month: m, ...total };
    }),
    daily: dailyChart(monthly, month).map((d) => ({
      ...d,
      day: Number(d.day),
    })),
  };
}
