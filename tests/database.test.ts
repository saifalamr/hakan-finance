import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-0000-0000-000000000001",
  outsider = "00000000-0000-0000-0000-000000000002";
test("PostgreSQL schema, RLS, payroll constraints and relationships", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users values ('${admin}'),('${outsider}');`,
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261003153214_finance_mvp.sql",
        "utf8",
      ),
    );
    await db.exec(
      (await readFile("supabase/setup-admin.sql", "utf8")).replaceAll(
        "ADMIN_USER_UUID",
        admin,
      ),
    );
    await assert.rejects(
      db.exec(`insert into app_admin(user_id) values ('${outsider}')`),
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);`,
    );
    const categories = await db.query<{ id: string; name: string }>(
      "select id,name from categories",
    );
    assert.equal(categories.rows.length, 11);
    const fuel = categories.rows.find((r) => r.name === "Yakıt")!.id,
      payroll = categories.rows.find((r) => r.name === "Personel")!.id,
      income = categories.rows.find((r) => r.name === "Müşteri Ödemesi")!.id;
    const vehicle = (
      await db.query<{ id: string }>(
        `insert into vehicles(user_id,plate,brand,model) values ('${admin}','34 TEST 123','Ford','Transit') returning id`,
      )
    ).rows[0].id;
    const employee = (
      await db.query<{ id: string }>(
        `insert into employees(user_id,name,salary,work_days) values ('${admin}','Test Personel',3000000,30) returning id`,
      )
    ).rows[0].id;
    const period = (
      await db.query<{ month: string; salary: number }>(
        `select month,salary from employee_periods where employee_id='${employee}'`,
      )
    ).rows[0];
    assert.ok(period);
    await db.exec(
      `insert into transactions(user_id,type,amount,category_id,vehicle_id) values ('${admin}','expense',250000,'${fuel}','${vehicle}')`,
    );
    await db.exec(
      `insert into transactions(user_id,type,amount,category_id,employee_id,payroll_kind) values ('${admin}','expense',300000,'${payroll}','${employee}','advance'); insert into transactions(user_id,type,amount,employee_id,payroll_kind) values ('${admin}','adjustment',100000,'${employee}','deduction');`,
    );
    assert.equal(
      Number(
        (
          await db.query<{ amount: number }>(
            `select sum(amount) as amount from transactions where type='expense'`,
          )
        ).rows[0].amount,
      ),
      550000,
    );
    await assert.rejects(
      db.exec(
        `insert into transactions(user_id,type,amount,category_id) values ('${admin}','expense',-1,'${fuel}')`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into transactions(user_id,type,amount,category_id) values ('${admin}','expense',1,'${income}')`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into transactions(user_id,type,amount,category_id,employee_id,payroll_kind,date) values ('${admin}','expense',1,'${payroll}','${employee}','advance','2000-01-01')`,
      ),
    );
    await assert.rejects(db.exec(`delete from vehicles where id='${vehicle}'`));
    await assert.rejects(
      db.exec(`update categories set type='income' where id='${fuel}'`),
    );
    await assert.rejects(
      db.exec(
        `update employee_periods set month='2000-01-01' where employee_id='${employee}'`,
      ),
    );
    await db.exec(`update employees set salary=4000000 where id='${employee}'`);
    assert.equal(
      Number(
        (
          await db.query<{ salary: number }>(
            `select salary from employee_periods where employee_id='${employee}'`,
          )
        ).rows[0].salary,
      ),
      3000000,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${outsider}',false)`,
    );
    assert.equal((await db.query("select * from transactions")).rows.length, 0);
    assert.equal((await db.query("select * from app_admin")).rows.length, 0);
    await assert.rejects(
      db.exec(
        `insert into vehicles(user_id,plate,brand,model) values ('${admin}','BAD','Ford','Transit')`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into vehicles(user_id,plate,brand,model) values ('${outsider}','BAD','Ford','Transit')`,
      ),
    );
    await assert.rejects(
      db.exec(`insert into app_admin(user_id) values ('${outsider}')`),
    );
    await db.exec("set role anon");
    await assert.rejects(db.exec("select * from transactions"));
    await db.exec("reset role");
    const security = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_class where relname in ('app_admin','transactions','vehicles','employees','categories','employee_periods') and relrowsecurity",
    );
    assert.equal(security.rows[0].count, 6);
  } finally {
    await db.close();
  }
});
