import { today } from "./finance";
export const DOCUMENT_WARNING_DAYS = 30;
export const VEHICLE_DOCUMENT_BUCKET = "vehicle-documents";
export const documentTypes = ["ruhsat", "muayene", "sigorta", "kasko"] as const;
export type DocumentType = (typeof documentTypes)[number];
export const documentLabels: Record<DocumentType, string> = {
  ruhsat: "Ruhsat",
  muayene: "Muayene",
  sigorta: "Trafik Sigortası",
  kasko: "Kasko",
};
export type VehicleDocument = {
  id: string;
  user_id: string;
  vehicle_id: string;
  type: DocumentType;
  start_date: string | null;
  end_date: string | null;
  provider: string | null;
  policy_number: string | null;
  notes: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
};
export function validDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1000-01-01" ||
    value > "9999-12-31"
  )
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function validateDocumentDates(start: string, end: string) {
  if ((start && !validDate(start)) || (end && !validDate(end)))
    throw new Error("Geçerli bir tarih girin.");
  if (start && end && end < start)
    throw new Error("Bitiş tarihi başlangıç tarihinden önce olamaz.");
}
export function daysBetween(date: string, reference: string): number {
  if (!validDate(date) || !validDate(reference))
    throw new Error("Geçerli bir tarih girin.");
  // Date-only UTC arithmetic avoids time-of-day and DST shifts; reference is Istanbul's date.
  return Math.round(
    (Date.parse(date + "T00:00:00Z") - Date.parse(reference + "T00:00:00Z")) /
      86400000,
  );
}
export type DocumentStatus = {
  tone: "normal" | "attention" | "high" | "neutral";
  label: string;
  days: number | null;
  needsAttention: boolean;
};
export function documentStatus(
  doc: VehicleDocument | undefined,
  reference = today(),
): DocumentStatus {
  const neutral = (label: string): DocumentStatus => ({
    tone: "neutral",
    label,
    days: null,
    needsAttention: false,
  });
  if (!doc) return neutral("Bilgi girilmedi");
  if (doc.type === "ruhsat")
    return doc.notes || doc.file_path
      ? { tone: "normal", label: "Mevcut", days: null, needsAttention: false }
      : neutral("Bilgi girilmedi");
  if (!doc.end_date)
    return neutral(
      doc.start_date ||
        doc.notes ||
        doc.file_path ||
        doc.provider ||
        doc.policy_number
        ? "Bitiş tarihi girilmedi"
        : "Bilgi girilmedi",
    );
  if (
    !validDate(doc.end_date) ||
    (doc.start_date && !validDate(doc.start_date))
  )
    return neutral("Tarih kontrol edilmeli");
  const days = daysBetween(doc.end_date, reference);
  if (days <= 0)
    return { tone: "high", label: "Süresi doldu", days, needsAttention: true };
  if (doc.start_date && doc.start_date > reference)
    return neutral(
      `${daysBetween(doc.start_date, reference)} gün sonra başlıyor`,
    );
  if (days <= DOCUMENT_WARNING_DAYS)
    return {
      tone: "attention",
      label: `${days} gün kaldı`,
      days,
      needsAttention: true,
    };
  return { tone: "normal", label: "Geçerli", days, needsAttention: false };
}
export function documentWarnings(
  documents: VehicleDocument[],
  reference = today(),
) {
  return documents
    .map((document) => ({
      document,
      status: documentStatus(document, reference),
    }))
    .filter((item) => item.status.needsAttention)
    .sort(
      (a, b) =>
        a.status.days! - b.status.days! ||
        documentTypes.indexOf(a.document.type) -
          documentTypes.indexOf(b.document.type) ||
        a.document.id.localeCompare(b.document.id),
    );
}
export function documentWarningLabel(
  item: ReturnType<typeof documentWarnings>[number],
) {
  const name =
    item.document.type === "sigorta"
      ? "Sigorta"
      : documentLabels[item.document.type];
  return item.status.days! <= 0
    ? `${name} süresi doldu`
    : `${name} ${item.status.days} gün`;
}
export function documentDate(date: string | null) {
  return date ? date.split("-").reverse().join(".") : "—";
}
