import { type Data, payrollLabels, money } from "./finance";
import { supabase } from "./supabase";
// History is requested only for an explicit report. Summary screens never use this path.
export async function exportData(
  data: Data,
  start: string,
  end: string,
  server: boolean,
): Promise<Data> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    start > end
  )
    throw new Error("Geçerli bir tarih aralığı seçin.");
  if (!server) return data;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 120000);
  try {
    // One SQL statement provides an internally consistent ledger snapshot, including labels,
    // payroll periods and the end-date balance, even when another tab saves a transaction.
    const { data: snapshot, error } = await supabase!
      .rpc("finance_export", { p_start: start, p_end: end })
      .abortSignal(controller.signal);
    if (error) throw error;
    if (snapshot.transactions.length > 50000)
      throw new Error("Rapor için daha kısa bir tarih aralığı seçin.");
    return { ...data, ...snapshot };
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
}
export function buildCSV(data: Data, start: string, end: string) {
  const categories = new Map(data.categories.map((c) => [c.id, c.name])),
    vehicles = new Map(data.vehicles.map((v) => [v.id, v.plate])),
    employees = new Map(data.employees.map((e) => [e.id, e.name]));
  // All text remains literal when opened by Excel, including formula-like descriptions.
  const cell = (v: string, index: number) =>
    '"' +
    (index < 6 && /^[\s]*[=+\-@\t\r]/.test(v) ? "'" + v : v).replaceAll(
      '"',
      '""',
    ) +
    '"';
  const rows = [
    [
      "Tarih",
      "Tür",
      "Kategori / Personel İşlemi",
      "Açıklama",
      "Plaka",
      "Personel",
      "Gelir (TRY)",
      "Gider (TRY)",
      "Maaş Düzeltmesi (TRY)",
    ],
  ];
  for (const t of [...data.transactions]
    .filter((t) => !t.deleted_at && t.date >= start && t.date <= end)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.created_at.localeCompare(b.created_at),
    ))
    rows.push([
      t.date.split("-").reverse().join("."),
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
      t.type === "income" ? money(t.amount).slice(1) : "0,00",
      t.type === "expense" ? money(t.amount).slice(1) : "0,00",
      t.type === "adjustment"
        ? money(t.payroll_kind === "deduction" ? -t.amount : t.amount).slice(1)
        : "0,00",
    ]);
  return "\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
export function downloadCSV(data: Data, start: string, end: string) {
  const blob = new Blob([buildCSV(data, start, end)], {
      type: "text/csv;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `islemler-${start}_${end}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
