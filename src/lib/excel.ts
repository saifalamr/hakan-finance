import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import {
  type Data,
  type Transaction,
  cashBalance,
  payrollSummary,
  payrollLabels,
  totals,
} from "./finance";
type Cell = string | number | { formula: string; value: number };
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const col = (i: number) => String.fromCharCode(65 + i);
const serial = (date: string) =>
  (Date.parse(date + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000;
export function reportRows(data: Data, start: string, end: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    start > end
  )
    throw new Error("Geçerli bir tarih aralığı seçin.");
  const transactions = data.transactions
    .filter((t) => !t.deleted_at && t.date >= start && t.date <= end)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.created_at.localeCompare(b.created_at),
    );
  const names = (rows: { id: string; name: string }[]) =>
    new Map(rows.map((r) => [r.id, r.name]));
  const categories = names(data.categories),
    employees = names(data.employees),
    vehicles = new Map(data.vehicles.map((v) => [v.id, v.plate]));
  const tx: Cell[][] = transactions.map((t) => [
    serial(t.date),
    t.type === "income"
      ? "Gelir"
      : t.type === "expense"
        ? "Gider"
        : "Maaş düzeltmesi",
    t.payroll_kind
      ? payrollLabels[t.payroll_kind]
      : categories.get(t.category_id || "") || "",
    t.description,
    vehicles.get(t.vehicle_id || "") || "",
    employees.get(t.employee_id || "") || "",
    t.type === "income" ? t.amount / 100 : 0,
    t.type === "expense" ? t.amount / 100 : 0,
    t.type === "adjustment"
      ? (t.payroll_kind === "deduction" ? -t.amount : t.amount) / 100
      : 0,
  ]);
  const vehicleTotals = new Map<string, number>(),
    categoryTotals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (t.vehicle_id)
      vehicleTotals.set(
        t.vehicle_id,
        (vehicleTotals.get(t.vehicle_id) || 0) + t.amount,
      );
    if (t.category_id)
      categoryTotals.set(
        t.category_id,
        (categoryTotals.get(t.category_id) || 0) + t.amount,
      );
  }
  const vehicleRows: Cell[][] = data.vehicles.map((v) => [
    v.plate,
    `${v.brand} ${v.model}`,
    (vehicleTotals.get(v.id) || 0) / 100,
  ]);
  const categoryRows: Cell[][] = data.categories
    .filter((c) => c.type === "expense")
    .map((c) => [c.name, (categoryTotals.get(c.id) || 0) / 100]);
  const payrollRows = new Map<string, Transaction[]>();
  for (const t of data.transactions) {
    if (!t.employee_id || t.deleted_at) continue;
    const key = `${t.employee_id}:${t.date.slice(0, 7)}`;
    const bucket = payrollRows.get(key);
    if (bucket) bucket.push(t);
    else payrollRows.set(key, [t]);
  }
  // Payroll entitlements and outstanding amounts always use full calendar months.
  // Cash totals on Özet/İşlemler use the exact selected days.
  const staff: Cell[][] = data.employee_periods
    .filter(
      (p) =>
        p.month.slice(0, 7) >= start.slice(0, 7) &&
        p.month.slice(0, 7) <= end.slice(0, 7),
    )
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((p) => {
      const summary = payrollSummary(
        p,
        payrollRows.get(`${p.employee_id}:${p.month.slice(0, 7)}`) || [],
      );
      return [
        p.month.slice(0, 7),
        employees.get(p.employee_id) || "",
        p.salary / 100,
        p.work_days,
        summary.salary / 100,
        summary.advance / 100,
        summary.salaryPayment / 100,
        summary.bonus / 100,
        summary.bonusDue / 100,
        summary.deduction / 100,
        summary.paid / 100,
        summary.remaining / 100,
      ];
    });
  const last = Math.max(6, tx.length + 5),
    total = totals(transactions);
  const balance =
    data.export_context?.end === end
      ? data.export_context.balance
      : cashBalance(data.finance_settings?.[0], data.transactions, end);
  const summary: Cell[][] = [
    [
      "Toplam Gelir",
      { formula: `SUM('İşlemler'!G6:G${last})`, value: total.income / 100 },
    ],
    [
      "Toplam Gider",
      { formula: `SUM('İşlemler'!H6:H${last})`, value: total.expense / 100 },
    ],
    ["Net Akış", { formula: "B6-B7", value: total.net / 100 }],
    [
      "Başlangıç Bakiyesi",
      data.finance_settings?.[0]
        ? data.finance_settings[0].opening_balance / 100
        : "Belirlenmedi",
    ],
    [
      "Bakiye Başlangıç Tarihi",
      data.finance_settings?.[0]?.opening_date || "Belirlenmedi",
    ],
    [
      "Dönem Sonu Güncel Bakiye",
      balance === null ? "Belirlenmedi" : balance / 100,
    ],
  ];
  return [summary, tx, vehicleRows, staff, categoryRows];
}
// Populate the reviewed Artifact Tool workbook template; no spreadsheet code is loaded until export.
export function buildReport(
  template: Uint8Array,
  data: Data,
  start: string,
  end: string,
): Uint8Array {
  const archive = unzipSync(template),
    sheets = reportRows(data, start, end);
  const numeric = [[1], [6, 7, 8], [2], [2, 4, 5, 6, 7, 8, 9, 10, 11], [1]];
  for (let i = 0; i < sheets.length; i++) {
    const path = `xl/worksheets/sheet${i + 1}.xml`,
      original = strFromU8(archive[path])
        .replaceAll("x:", "")
        .replace("xmlns:x=", "xmlns=");
    const originalRows = [
      ...original.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>[\s\S]*?<\/row>/g),
    ];
    const getRow = (n: number) =>
      originalRows.find((r) => Number(r[1]) === n)?.[0] || "";
    const styleCache = new Map<number, Map<string, string>>();
    const styles = (n: number) => {
      if (styleCache.has(n)) return styleCache.get(n)!;
      const result = new Map(
        [...getRow(n).matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>/g)].map((m) => [
          m[1],
          /\bs="(\d+)"/.exec(m[0])?.[1] || "0",
        ]),
      );
      styleCache.set(n, result);
      return result;
    };
    const makeRow = (n: number, values: Cell[], styleRow: number) => {
      const format = styles(styleRow);
      const height =
        i === 1 && typeof values[3] === "string"
          ? Math.max(27, Math.ceil(values[3].length / 48) * 18)
          : styleRow === 8
            ? 30
            : 27;
      return `<row r="${n}" ht="${height}" customHeight="1">${values
        .map((v, j) => {
          const attrs = `r="${col(j)}${n}" s="${format.get(col(j)) || "0"}"`;
          if (typeof v === "number") return `<c ${attrs} t="n"><v>${v}</v></c>`;
          if (typeof v === "object")
            return `<c ${attrs}><f>${escape(v.formula)}</f><v>${v.value}</v></c>`;
          // Inline strings prevent user descriptions from becoming executable formulas.
          return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${escape(v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""))}</t></is></c>`;
        })
        .join("")}</row>`;
    };
    const rows = sheets[i],
      count = rows.length || 1,
      last = count + 5,
      cols = [2, 9, 3, 12, 2][i];
    let sheetData =
      getRow(1) +
      makeRow(
        2,
        [
          `${start} — ${end} · TRY${i === 3 ? " · Maaş özeti tam aylara aittir" : ""}`,
        ],
        2,
      ) +
      getRow(3) +
      getRow(4) +
      getRow(5);
    sheetData += (rows.length ? rows : [Array(cols).fill("")])
      .map((r, j) =>
        makeRow(j + 6, r, i === 0 && (j === 2 || j === 5) ? 8 : j % 2 ? 7 : 6),
      )
      .join("");
    if (i !== 0) {
      const values: Cell[] = Array(cols).fill("");
      values[0] = "Toplam";
      numeric[i].forEach((j) => {
        values[j] = {
          formula: `SUM(${col(j)}6:${col(j)}${last})`,
          value: rows.reduce(
            (s, r) => s + (typeof r[j] === "number" ? (r[j] as number) : 0),
            0,
          ),
        };
      });
      sheetData += makeRow(last + 1, values, 8);
    }
    let xml = original
      .replace(
        /<sheetData>[\s\S]*?<\/sheetData>/,
        `<sheetData>${sheetData}</sheetData>`,
      )
      .replace(
        /<dimension\b[^>]*\/>/,
        `<dimension ref="A1:${col(cols - 1)}${last + 1}"/>`,
      );
    if (i !== 0)
      xml = xml.replace(
        "</sheetData>",
        `</sheetData><autoFilter ref="A5:${col(cols - 1)}${last}"/>`,
      );
    archive[path] = strToU8(xml);
  }
  return zipSync(archive, { level: 6 });
}
