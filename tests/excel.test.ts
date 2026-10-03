import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { buildReport, reportRows } from "../src/lib/excel";
import { makeDemo } from "../src/lib/demo";
import { currentMonth } from "../src/lib/finance";
test("styled XLSX uses typed amounts, formulas, real dates, filters and safe descriptions", async () => {
  const data = makeDemo(),
    month = currentMonth();
  data.transactions[0].description =
    '=HYPERLINK("https://evil.test") & <script>';
  data.transactions.push({
    ...data.transactions[0],
    id: "deleted",
    amount: 99999999,
    deleted_at: "deleted",
  });
  const template = new Uint8Array(
    await readFile("public/report-template.xlsx"),
  );
  const start = `${month}-01`,
    end = `${month}-31`;
  const bytes = buildReport(template, data, start, end),
    zip = unzipSync(bytes);
  assert.ok(bytes.length > 2000);
  const tx = strFromU8(zip["xl/worksheets/sheet2.xml"]),
    summary = strFromU8(zip["xl/worksheets/sheet1.xml"]);
  assert.match(tx, /<autoFilter ref="A5:I10"/);
  assert.match(tx, /t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/);
  assert.match(tx, /&amp; &lt;script&gt;/);
  assert.doesNotMatch(tx, /999999\.99/);
  assert.match(tx, /<f>SUM\(H6:H10\)<\/f><v>11600<\/v>/);
  assert.match(summary, /<f>B6-B7<\/f><v>39400<\/v>/);
  assert.match(strFromU8(zip["xl/styles.xml"]), /294F46/i);
  assert.match(tx, /state="frozen"/);
  const report = reportRows(data, start, end);
  assert.equal(report[1].length, 5);
  assert.throws(() => reportRows(data, end, start));
  // A no-record period still exports five readable sheets and valid zero totals.
  const empty = unzipSync(
    buildReport(template, data, "2000-01-01", "2000-01-31"),
  );
  assert.match(
    strFromU8(empty["xl/worksheets/sheet2.xml"]),
    /<f>SUM\(H6:H6\)<\/f><v>0<\/v>/,
  );
});
