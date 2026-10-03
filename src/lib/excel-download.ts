import type { Data } from "./finance";
export async function downloadReport(data: Data, start: string, end: string) {
  // Compression and XML generation run off the UI thread. No report is stored on Supabase.
  const worker = new Worker(new URL("./report-worker.ts", import.meta.url), {
    type: "module",
  });
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error("Excel hazırlanamadı. Daha kısa bir tarih aralığı seçin."),
      );
    }, 120000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (
      event: MessageEvent<{ bytes?: Uint8Array; error?: string }>,
    ) => {
      finish();
      if (event.data.bytes) resolve(event.data.bytes);
      else reject(new Error(event.data.error || "Excel hazırlanamadı."));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Excel hazırlanamadı. Yeniden deneyin."));
    };
    // Only send history required by the report and its end-date cash balance.
    try {
      worker.postMessage({
        data: {
          ...data,
          transactions: data.transactions.filter(
            (t) => !t.deleted_at && t.date.slice(0, 7) <= end.slice(0, 7),
          ),
        },
        start,
        end,
      });
    } catch (error) {
      finish();
      reject(error);
    }
  });
  const blob = new Blob([new Uint8Array(bytes).buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `finans-${start}_${end}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
