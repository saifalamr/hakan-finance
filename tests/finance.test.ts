import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMoney,
  payrollSummary,
  totals,
  filterDates,
  dailyChart,
  shiftMonth,
  today,
  currentMonth,
  cashBalance,
  parseBalance,
  type Transaction,
  type PayrollPeriod,
} from "../src/lib/finance";
const transaction = (values: Partial<Transaction>): Transaction => ({
  id: "t",
  user_id: "u",
  amount: 10000,
  type: "expense",
  date: today(),
  category_id: "c",
  description: "",
  vehicle_id: null,
  employee_id: null,
  payroll_kind: null,
  created_at: "",
  ...values,
});
test("opening balance uses its inclusive start, excludes deleted and future cash entries", () => {
  const settings = {
    id: "s",
    user_id: "u",
    opening_balance: 500000,
    opening_date: "2026-10-01",
  };
  const rows = [
    transaction({ type: "income", amount: 100000, date: "2026-09-30" }),
    transaction({ type: "income", amount: 200000, date: "2026-10-01" }),
    transaction({ amount: 250050, date: "2026-10-03" }),
    transaction({
      amount: 100000,
      date: "2026-10-03",
      deleted_at: "2026-10-03",
    }),
    transaction({ amount: 100000, date: "2026-10-05" }),
    transaction({ type: "adjustment", amount: 100000, date: "2026-10-03" }),
  ];
  assert.equal(cashBalance(settings, rows, "2026-10-03"), 449950);
  assert.equal(cashBalance(settings, rows, "2026-09-30"), null);
  assert.equal(cashBalance(undefined, rows, "2026-10-03"), null);
  assert.equal(parseBalance("-2.500,50"), -250050);
  assert.equal(parseBalance("0"), 0);
  const due = transaction({
    type: "adjustment",
    payroll_kind: "bonus_due",
    amount: 200000,
  });
  const period = { salary: 3000000, work_days: 30 } as PayrollPeriod;
  assert.equal(payrollSummary(period, [due]).remaining, 3200000);
  assert.equal(totals([due]).expense, 0);
  const paid = {
    ...due,
    type: "expense" as const,
    payroll_kind: "bonus" as const,
  };
  assert.equal(payrollSummary(period, [paid]).remaining, 3000000);
  assert.equal(totals([paid]).expense, 200000);
  assert.equal(
    payrollSummary(period, [{ ...due, deleted_at: "deleted" }]).remaining,
    3000000,
  );
});
test("Turkish currency parsing is exact in kuruş and rejects invalid amounts", () => {
  assert.equal(parseMoney("₺12.450,25"), 1245025);
  assert.equal(parseMoney("2500"), 250000);
  assert.equal(parseMoney("2500.50"), 250050);
  assert.equal(parseMoney("2.500"), 250000);
  for (const value of [
    "-20",
    "0",
    "2,000",
    "NaN",
    "1e3",
    "9".repeat(17),
    "12.3.45",
  ])
    assert.throws(() => parseMoney(value));
});
test("deductions reduce payroll without being counted as cash expenses", () => {
  const period = { salary: 3000000, work_days: 20 } as PayrollPeriod;
  const transactions = [
    transaction({ amount: 300000, payroll_kind: "advance" }),
    transaction({ amount: 500000, payroll_kind: "salary_payment" }),
    transaction({ amount: 200000, payroll_kind: "bonus" }),
    transaction({
      amount: 100000,
      payroll_kind: "deduction",
      type: "adjustment",
    }),
  ];
  const summary = payrollSummary(period, transactions);
  assert.equal(summary.salary, 2000000);
  assert.equal(summary.earned, 2100000);
  assert.equal(summary.paid, 1000000);
  assert.equal(summary.remaining, 1100000);
  assert.equal(totals(transactions).expense, 1000000);
  assert.equal(
    payrollSummary(period, [
      transaction({ amount: 4000000, payroll_kind: "salary_payment" }),
    ]).remaining,
    -2000000,
  );
});
test("dates and chart totals stay in their selected month", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  const month = currentMonth();
  const txs = [
    transaction({ type: "income", amount: 400000 }),
    transaction({ type: "expense", amount: 125000 }),
    transaction({ type: "adjustment", amount: 30000 }),
  ];
  const chart = dailyChart(txs, month);
  assert.equal(
    chart.reduce((sum, row) => sum + row.Gelir * 100, 0),
    400000,
  );
  assert.equal(
    chart.reduce((sum, row) => sum + row.Gider * 100, 0),
    125000,
  );
  assert.equal(filterDates(txs, "today", "", "").length, 3);
  assert.equal(
    filterDates(txs, "custom", "2000-01-01", "2000-01-02").length,
    0,
  );
});
