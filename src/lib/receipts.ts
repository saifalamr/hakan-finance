import { supabase } from "./supabase";
export const RECEIPT_LIMIT = 2 * 1024 * 1024;
export async function prepareReceipt(file: File): Promise<Blob> {
  if (
    !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
      file.type,
    )
  )
    throw new Error("JPEG, PNG, WebP veya PDF seçin.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Kaynak dosya en fazla 10 MB olabilir.");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const valid =
    file.type === "application/pdf"
      ? String.fromCharCode(...header.slice(0, 5)) === "%PDF-"
      : file.type === "image/jpeg"
        ? header[0] === 255 && header[1] === 216
        : file.type === "image/png"
          ? header[0] === 137 &&
            header[1] === 80 &&
            header[2] === 78 &&
            header[3] === 71
          : String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!valid) throw new Error("Dosya içeriği desteklenen türle eşleşmiyor.");
  if (file.type === "application/pdf") {
    if (file.size > RECEIPT_LIMIT)
      throw new Error("PDF en fazla 2 MB olabilir.");
    return file;
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000)
      throw new Error("Görüntü çözünürlüğü çok yüksek.");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Görüntü hazırlanamadı.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Görüntü hazırlanamadı."))),
        "image/jpeg",
        0.82,
      ),
    );
    if (blob.size > RECEIPT_LIMIT)
      throw new Error("Sıkıştırılmış görsel en fazla 2 MB olabilir.");
    return blob;
  } finally {
    bitmap.close();
  }
}
export async function uploadReceipt(blob: Blob, path: string) {
  const { error } = await supabase!.storage
    .from("finance-receipts")
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error && !/already exists|Duplicate/i.test(error.message)) throw error;
}
export async function openReceipt(path: string) {
  const { data, error } = await supabase!.storage
    .from("finance-receipts")
    .createSignedUrl(path, 60);
  if (error) throw error;
  // Link opened by the original user gesture's pre-opened window; avoid popup blockers.
  return data.signedUrl;
}
