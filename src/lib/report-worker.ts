import { buildReport } from "./excel";
import { boundedFetch } from "./network";
import type { Data } from "./finance";
self.onmessage = async (
  event: MessageEvent<{ data: Data; start: string; end: string }>,
) => {
  try {
    const response = await boundedFetch("/report-template.xlsx");
    if (!response.ok)
      throw new Error("Excel şablonu yüklenemedi. Yeniden deneyin.");
    const { data, start, end } = event.data;
    const bytes = buildReport(
      new Uint8Array(await response.arrayBuffer()),
      data,
      start,
      end,
    );
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Excel hazırlanamadı.",
    });
  }
};
