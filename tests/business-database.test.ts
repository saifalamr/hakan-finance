import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localSnapshot,
  vehicleStatus,
  nextRecurringDate,
} from "../src/lib/business";
import { type Data } from "../src/lib/finance";
import { businessDB, admin, outsider } from "./business-fixture";

test("business migration aggregates, owned pagination, archiving, receipts and recurring idempotency", async () => {
  const db = await businessDB();
  try {
    const fuel = (
      await db.query<{ id: string }>(
        "select id from categories where name='Yakıt'",
      )
    ).rows[0].id;
    const payroll = (
      await db.query<{ id: string }>(
        "select id from categories where name='Personel'",
      )
    ).rows[0].id;
    const income = (
      await db.query<{ id: string }>(
        "select id from categories where name='Müşteri Ödemesi'",
      )
    ).rows[0].id;
    const v = (
      await db.query<{ id: string }>(
        `insert into vehicles(user_id,plate,brand,model)values('${admin}','34 QA 100','Ford','Transit')returning id`,
      )
    ).rows[0].id;
    const e = (
      await db.query<{ id: string }>(
        `insert into employees(user_id,name,salary,work_days)values('${admin}','Yerel QA',3000050,20)returning id`,
      )
    ).rows[0].id;
    await db.exec(
      `insert into employee_periods(user_id,employee_id,month,salary,work_days)values('${admin}','${e}','2026-10-01',3000050,20)on conflict(user_id,employee_id,month)do update set salary=excluded.salary,work_days=excluded.work_days;insert into finance_settings(user_id,opening_balance,opening_date)values('${admin}',-100000,'2026-01-01');`,
    );
    await db.exec(
      `insert into transactions(user_id,type,amount,category_id,vehicle_id,date)values('${admin}','expense',100000,'${fuel}','${v}','2026-07-15'),('${admin}','expense',110000,'${fuel}','${v}','2026-08-15'),('${admin}','expense',90000,'${fuel}','${v}','2026-09-15');insert into transactions(user_id,type,amount,category_id,vehicle_id,employee_id,date,description)values('${admin}','expense',140000,'${fuel}','${v}','${e}','2026-10-01','Sürücü ve araç bağlantılı');insert into transactions(user_id,type,amount,category_id,date)values('${admin}','income',1000000,'${income}','2026-10-02');insert into transactions(user_id,type,amount,category_id,employee_id,payroll_kind,date)values('${admin}','expense',300000,'${payroll}','${e}','advance','2026-10-01'),('${admin}','expense',1000000,'${payroll}','${e}','salary_payment','2026-10-02'),('${admin}','expense',200000,'${payroll}','${e}','bonus','2026-10-02');insert into transactions(user_id,type,amount,employee_id,payroll_kind,date)values('${admin}','adjustment',50000,'${e}','deduction','2026-10-01'),('${admin}','adjustment',100000,'${e}','bonus_due','2026-10-02');`,
    );
    const query = await db.query<{
      snapshot: ReturnType<typeof localSnapshot>;
    }>(`select finance_summary('2026-10-01') snapshot`);
    const snap = query.rows[0].snapshot;
    assert.deepEqual(snap.total, {
      income: 1000000,
      expense: 1640000,
      net: -640000,
    });
    assert.equal(snap.vehicles[0].lifetime, 440000);
    assert.equal(snap.vehicles[0].current, 140000);
    assert.equal(snap.vehicles[0].previous, 90000);
    assert.equal(vehicleStatus(snap.vehicles[0]).status, "high");
    assert.equal(snap.employees[0].earned_salary, 2000033);
    assert.equal(snap.employees[0].remaining, 750033);
    assert.equal(snap.employees[0].paid, 1500000);
    assert.equal(snap.daily.length, 31);
    assert.equal(snap.daily[3].Gider, 0);
    // SQL and shared demo/compatibility formulas agree, including archived and non-cash rows.
    const data = {} as Data;
    for (const table of [
      "transactions",
      "vehicles",
      "employees",
      "categories",
      "employee_periods",
      "finance_settings",
    ] as const)
      (data[table] as unknown) = (
        await db.query<{ row: unknown }>(
          `select to_jsonb(t) row from ${table} t`,
        )
      ).rows.map((r) => r.row);
    const local = localSnapshot(data, "2026-10");
    assert.deepEqual(local.total, snap.total);
    assert.equal(local.employees[0].remaining, snap.employees[0].remaining);
    assert.equal(local.vehicles[0].current, snap.vehicles[0].current);
    const exported = (
      await db.query<{ value: Data }>(
        "select finance_export('2026-10-02','2026-10-02') value",
      )
    ).rows[0].value;
    assert.equal(exported.transactions.length, 7); // Whole month preserves salary entitlements.
    assert.equal(exported.employee_periods.length, 1);
    assert.equal(exported.finance_settings?.[0].opening_balance, -100000);
    assert.equal(exported.export_context?.balance, -1040000);
    assert.equal(exported.export_context?.end, "2026-10-02");
    const page = (
      await db.query<{
        p: {
          rows: Data["transactions"];
          count: number;
          total: ReturnType<typeof localSnapshot>["total"];
        };
      }>(
        `select finance_transactions(p_start=>'2026-10-01',p_end=>'2026-10-31',p_limit=>2) p`,
      )
    ).rows[0].p;
    assert.equal(page.rows.length, 3);
    assert.equal(page.count, 7);
    assert.deepEqual(page.total, snap.total);
    const last = page.rows[1];
    const next = (
      await db.query<{ p: { rows: Data["transactions"] } }>(
        `select finance_transactions(p_start=>'2026-10-01',p_end=>'2026-10-31',p_limit=>2,p_cursor_date=>'${last.date}',p_cursor_created=>'${last.created_at}',p_cursor_id=>'${last.id}')p`,
      )
    ).rows[0].p;
    assert.ok(
      !next.rows.some((t) => t.id === last.id || t.id === page.rows[0].id),
    );
    const t =
      page.rows.find((t) => t.type === "expense") ||
      data.transactions.find((t) => t.type === "expense")!;
    const path = `${admin}/${t.id}/test.pdf`;
    await db.exec(
      `insert into storage.objects(bucket_id,name,metadata)values('finance-receipts','${path}','{"size":1000}');update transactions set receipt_path='${path}' where id='${t.id}';`,
    );
    assert.equal(
      (
        await db.query(
          `delete from storage.objects where name='${path}' returning id`,
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(
        `update transactions set receipt_path='${outsider}/${t.id}/x.pdf' where id='${t.id}'`,
      ),
    );
    await db.exec(
      `update transactions set receipt_path=null where id='${t.id}'`,
    );
    assert.equal(
      (
        await db.query(
          `delete from storage.objects where name='${path}'returning id`,
        )
      ).rows.length,
      1,
    );
    const due = "2024-01-31";
    const r = (
      await db.query<{ id: string }>(
        `insert into recurring_expenses(user_id,name,amount,category_id,frequency,next_date,anchor_day,anchor_month)values('${admin}','Kira',1000,'${fuel}','monthly','${due}',31,1)returning id`,
      )
    ).rows[0].id;
    const first = (
      await db.query<{ id: string }>(`select post_recurring('${r}','${due}')id`)
    ).rows[0].id;
    const second = (
      await db.query<{ id: string }>(`select post_recurring('${r}','${due}')id`)
    ).rows[0].id;
    assert.equal(first, second);
    assert.equal(
      (
        await db.query<{ next_date: string }>(
          `select next_date::text from recurring_expenses where id='${r}'`,
        )
      ).rows[0].next_date,
      "2024-02-29",
    );
    await db.exec(`select post_recurring('${r}','2024-02-29')`);
    assert.equal(
      (
        await db.query<{ next_date: string }>(
          `select next_date::text from recurring_expenses where id='${r}'`,
        )
      ).rows[0].next_date,
      "2024-03-31",
    );
    await assert.rejects(db.exec(`select post_recurring('${r}','2024-02-15')`));
    await db.exec(
      `update vehicles set archived_at=now() where id='${v}';update employees set archived_at=now() where id='${e}';`,
    );
    await assert.rejects(db.exec(`delete from vehicles where id='${v}'`));
    await assert.rejects(db.exec(`delete from employees where id='${e}'`));
    await assert.rejects(
      db.exec(
        `insert into transactions(user_id,type,amount,category_id,vehicle_id)values('${admin}','expense',1000,'${fuel}','${v}')`,
      ),
    );
    await db.exec(
      `update transactions set description='Historical edit' where id='${t.id}';update vehicles set archived_at=null where id='${v}'`,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${outsider}',false)`,
    );
    assert.equal(
      (
        await db.query<{ s: { vehicles: unknown[] } }>(
          `select finance_summary('2026-10-01')s`,
        )
      ).rows[0].s.vehicles.length,
      0,
    );
    assert.equal(
      (await db.query(`select * from recurring_expenses`)).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(
        `insert into storage.objects(bucket_id,name)values('finance-receipts','${outsider}/fake.pdf')`,
      ),
    );
    await db.exec("set role anon");
    await assert.rejects(db.exec(`select finance_summary('2026-10-01')`));
  } finally {
    await db.close();
  }
});
test("history status boundaries and month-end recurrence dates", () => {
  assert.equal(
    vehicleStatus({
      current: 500000,
      history: [{ month: "2026-09", amount: 100 }],
    }).status,
    "neutral",
  );
  const history = [
    { month: "2026-08", amount: 100000 },
    { month: "2026-09", amount: 100000 },
  ];
  assert.equal(vehicleStatus({ current: 110000, history }).status, "normal");
  assert.equal(vehicleStatus({ current: 110001, history }).status, "attention");
  assert.equal(vehicleStatus({ current: 135000, history }).status, "attention");
  assert.equal(vehicleStatus({ current: 135001, history }).status, "high");
  assert.equal(nextRecurringDate("2026-01-31", "monthly", 31, 1), "2026-02-28");
  assert.equal(nextRecurringDate("2026-02-28", "monthly", 31, 1), "2026-03-31");
  assert.equal(nextRecurringDate("2024-02-29", "yearly", 29, 2), "2025-02-28");
  assert.equal(nextRecurringDate("2026-12-28", "weekly", 28, 12), "2027-01-04");
});
