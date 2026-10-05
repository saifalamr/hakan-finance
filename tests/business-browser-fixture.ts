import type { Page } from "@playwright/test";
import { businessDB, admin } from "./business-fixture";
import { currentMonth, shiftMonth, today } from "../src/lib/finance";
export async function businessAPI(page: Page, large = false) {
  const db = await businessDB();
  const month = currentMonth();
  const fuel = (
    await db.query<{ id: string }>(
      "select id from categories where name='Yakıt'",
    )
  ).rows[0].id;
  const vehicles = (
    await db.query<{ id: string; plate: string }>(
      `insert into vehicles(user_id,plate,brand,model)select '${admin}','34 QA '||lpad(n::text,3,'0'),'Renault','Clio' from generate_series(1,${large ? 50 : 7})n returning id,plate`,
    )
  ).rows;
  const employee = (
    await db.query<{ id: string }>(
      `insert into employees(user_id,name,salary,work_days)values('${admin}','Yerel Test Personel',3000000,30)returning id`,
    )
  ).rows[0].id;
  for (const v of vehicles.slice(0, 6)) {
    for (const h of [-2, -1])
      await db.query(
        `insert into transactions(user_id,type,amount,category_id,vehicle_id,date)values($1,'expense',100000,$2,$3,$4)`,
        [admin, fuel, v.id, shiftMonth(month, h) + "-01"],
      );
    await db.query(
      `insert into transactions(user_id,type,amount,category_id,vehicle_id,date)values($1,'expense',$2,$3,$4,$5)`,
      [
        admin,
        v.plate.endsWith("001")
          ? 150000
          : v.plate.endsWith("002")
            ? 120000
            : 90000,
        fuel,
        v.id,
        today(),
      ],
    );
  }
  if (large)
    await db.query(
      `insert into transactions(user_id,type,amount,category_id,date,description)select $1,'expense',12345,$2,$3,'Yerel stress '||n from generate_series(1,20000)n`,
      [admin, fuel, today()],
    );
  const user = {
    id: admin,
    email: "admin@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  await page
    .context()
    .route(
      "http://127.0.0.1:54321/storage/v1/object/sign/**?token=test",
      async (route) => {
        await route.fulfill({
          contentType: "text/html",
          body: "<p>Yerel test belgesi</p>",
        });
      },
    );
  const calls: { path: string; method: string; rows: number }[] = [];
  const allowed = new Set([
    "transactions",
    "vehicles",
    "employees",
    "categories",
    "employee_periods",
    "finance_settings",
    "recurring_expenses",
    "vehicle_documents",
  ]);
  let holdWrite: Promise<void> | null = null;
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    let body: unknown = {};
    let count = 0;
    try {
      if (path === "/auth/v1/token")
        body = {
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user,
        };
      else if (path === "/auth/v1/user") body = user;
      else if (path === "/auth/v1/logout") {
        await route.fulfill({ status: 204 });
        return;
      } else if (path === "/rest/v1/app_admin") body = [{ user_id: admin }];
      else if (path.startsWith("/rest/v1/rpc/")) {
        const name = path.split("/").at(-1)!,
          args = req.postDataJSON();
        let sql = "",
          params: unknown[] = [];
        if (name === "finance_summary") {
          sql = "select finance_summary($1::date) value";
          params = [args.p_month];
        }
        if (name === "finance_export") {
          sql = "select finance_export($1::date,$2::date) value";
          params = [args.p_start, args.p_end];
        }
        if (name === "finance_balance") {
          sql = "select finance_balance($1::date) value";
          params = [args.p_end];
        }
        if (name === "delete_unused_vehicle") {
          if (holdWrite) await holdWrite;
          sql = "select delete_unused_vehicle($1::uuid) value";
          params = [args.p_vehicle];
        }
        if (name === "delete_unused_employee") {
          if (holdWrite) await holdWrite;
          sql = "select delete_unused_employee($1::uuid) value";
          params = [args.p_employee];
        }
        if (name === "post_recurring") {
          sql = "select post_recurring($1::uuid,$2::date) value";
          params = [args.p_id, args.p_due];
        }
        if (name === "finance_transactions") {
          sql =
            "select finance_transactions($1::date,$2::date,$3::uuid,$4::uuid,$5::text,$6::text,$7::boolean,$8::date,$9::timestamptz,$10::uuid,$11::int)value";
          params = [
            args.p_start || null,
            args.p_end || null,
            args.p_vehicle || null,
            args.p_employee || null,
            args.p_type || null,
            args.p_search || "",
            args.p_trash || false,
            args.p_cursor_date || null,
            args.p_cursor_created || null,
            args.p_cursor_id || null,
            args.p_limit || 40,
          ];
        }
        if (!sql) throw new Error("Unsupported test RPC");
        body = (await db.query<{ value: unknown }>(sql, params)).rows[0].value;
        count = (body as { rows?: unknown[] })?.rows?.length || 0;
      } else if (path.startsWith("/rest/v1/")) {
        const table = path.split("/").at(-1)!;
        if (!allowed.has(table)) throw new Error("Unexpected test table");
        const params: unknown[] = [];
        const where: string[] = [];
        for (const [key, value] of url.searchParams) {
          if (!/^(id|user_id|employee_id|month)$/.test(key)) continue;
          const [op, ...raw] = value.split(".");
          const ops: Record<string, string> = {
            eq: "=",
            gt: ">",
            gte: ">=",
            lte: "<=",
          };
          if (ops[op]) {
            params.push(raw.join("."));
            where.push(`${key}${ops[op]}$${params.length}`);
          }
        }
        if (req.method() === "GET") {
          body = (
            await db.query<{ row: unknown }>(
              `select to_jsonb(t)row from ${table} t ${where.length ? "where " + where.join(" and ") : ""} order by id limit ${Math.min(Number(url.searchParams.get("limit") || 1000), 1000)}`,
              params,
            )
          ).rows.map((r) => r.row);
          count = (body as unknown[]).length;
        } else if (req.method() === "POST") {
          if (holdWrite) await holdWrite;
          const input = req.postDataJSON();
          const keys = Object.keys(input);
          if (keys.some((k) => !/^[a-z_]+$/.test(k)))
            throw new Error("invalid field");
          const entries = Object.values(input);
          let conflict = "";
          if (url.searchParams.has("on_conflict")) {
            const columns = url.searchParams.get("on_conflict")!;
            if (!["user_id", "user_id,employee_id,month"].includes(columns))
              throw new Error("invalid conflict");
            conflict =
              ` on conflict(${columns}) do update set ` +
              keys
                .filter((k) => !["user_id", "employee_id", "month"].includes(k))
                .map((k) => `${k}=excluded.${k}`)
                .join(",");
          }
          body = (
            await db.query<{ row: unknown }>(
              `with saved as(insert into ${table}(${keys.join(",")})values(${keys.map((_, i) => "$" + (i + 1)).join(",")})${conflict} returning *)select to_jsonb(saved)row from saved`,
              entries,
            )
          ).rows.map((r) => r.row);
        } else if (req.method() === "PATCH") {
          if (holdWrite) await holdWrite;
          const input = req.postDataJSON(),
            keys = Object.keys(input);
          if (keys.some((k) => !/^[a-z_]+$/.test(k)))
            throw new Error("invalid field");
          const offset = params.length;
          params.push(...Object.values(input));
          body = (
            await db.query<{ row: unknown }>(
              `with saved as(update ${table} set ${keys.map((k, i) => `${k}=$${offset + i + 1}`).join(",")} where ${where.join(" and ")} returning *)select to_jsonb(saved)row from saved`,
              params,
            )
          ).rows.map((r) => r.row);
        } else throw new Error("Unexpected test method");
      } else if (path.startsWith("/storage/v1/object/sign/"))
        body = { signedURL: path.replace("/storage/v1", "") + "?token=test" };
      else if (path.startsWith("/storage/v1/object/")) {
        const parts = path.split("/");
        const bucket = parts[4];
        if (!["finance-receipts", "vehicle-documents"].includes(bucket))
          throw new Error("Unexpected bucket");
        if (req.method() === "DELETE") {
          body = [];
          for (const name of req.postDataJSON().prefixes) {
            const deleted = await db.query<{ name: string }>(
              "delete from storage.objects where bucket_id=$1 and name=$2 returning name",
              [bucket, name],
            );
            (body as unknown[]).push(...deleted.rows);
          }
        } else {
          const name = decodeURIComponent(parts.slice(5).join("/"));
          await db.query(
            "insert into storage.objects(bucket_id,name,metadata)values($1,$2,$3)",
            [bucket, name, { size: req.postDataBuffer()?.length || 1000 }],
          );
          body = { Key: bucket + "/" + name, Id: crypto.randomUUID() };
        }
      }
      calls.push({ path, method: req.method(), rows: count });
      await route.fulfill({ json: body });
    } catch (error) {
      const e = error as { code?: string; message: string };
      await route.fulfill({
        status: 400,
        json: {
          code: e.code || "TEST",
          message: e.message,
          details: null,
          hint: null,
        },
      });
    }
  });
  return {
    db,
    calls,
    vehicles,
    employee,
    fuel,
    hold: (p: Promise<void> | null) => {
      holdWrite = p;
    },
  };
}
