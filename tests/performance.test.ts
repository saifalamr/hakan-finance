import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { unzipSync, strFromU8 } from "fflate";
import { boundedFetch } from "../src/lib/network";
import { buildReport, reportRows } from "../src/lib/excel";
import { dailyChart, totals } from "../src/lib/finance";
import { makeDemo } from "../src/lib/demo";

test("50,000 local transactions retain exact totals, chart and styled report data", async () => {
  const data = makeDemo();
  data.employee_periods = [];
  data.transactions = Array.from({ length: 50000 }, (_, i) => ({
    ...data.transactions[0],
    id: `stress-${i}`,
    date: "2026-10-03",
    type: i % 2 ? ("expense" as const) : ("income" as const),
    amount: 12345,
    description: `Yerel test ${i}`,
    deleted_at: i % 10 === 0 ? "deleted" : null,
  }));
  const started = performance.now();
  const total = totals(data.transactions);
  assert.deepEqual(total, {
    income: 20000 * 12345,
    expense: 25000 * 12345,
    net: -5000 * 12345,
  });
  const chart = dailyChart(data.transactions, "2026-10");
  assert.ok(Math.abs(chart[2].Gelir - total.income / 100) < 0.001);
  assert.ok(Math.abs(chart[2].Gider - total.expense / 100) < 0.001);
  const rows = reportRows(data, "2026-10-01", "2026-10-31");
  assert.equal(rows[1].length, 45000);
  const template = new Uint8Array(
    await readFile("public/report-template.xlsx"),
  );
  const archive = unzipSync(
    buildReport(template, data, "2026-10-01", "2026-10-31"),
  );
  const xml = strFromU8(archive["xl/worksheets/sheet2.xml"]);
  assert.match(xml, /autoFilter ref="A5:I45005"/);
  assert.match(xml, /Yerel test 49999/);
  console.info(
    `50,000 local rows: calculations and XLSX ${Math.round(performance.now() - started)}ms`,
  );
});

test("requests have a deadline, preserve caller cancellation and never retry writes", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!;
      const abort = () => reject(signal.reason);
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
  };
  // Keep the node test alive while AbortSignal.timeout's unref'd timer fires.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(
      boundedFetch("https://example.test", { method: "POST" }, 20),
      { name: "TimeoutError" },
    );
    assert.equal(calls, 1);
    const controller = new AbortController();
    const request = boundedFetch("https://example.test", {
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(request, { name: "AbortError" });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    clearInterval(keepAlive);
  }
});
