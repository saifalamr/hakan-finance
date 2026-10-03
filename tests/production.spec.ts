import { test, expect } from "@playwright/test";
test("production contains no demo access, protects deep links and serves PWA assets", async ({
  page,
  request,
}) => {
  await page.goto("/personel/private-record");
  await expect(
    page.getByText("Uygulama kurulumu henüz tamamlanmadı."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Geliştirme demosunu aç" }),
  ).toHaveCount(0);
  await expect(page.getByText("Maaş özeti")).toHaveCount(0);
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");
  for (const path of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable.png",
    "/icons/apple-touch-icon.png",
    "/offline.html",
    "/sw.js",
  ])
    expect((await request.get(path)).ok()).toBe(true);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  expect(
    await page.evaluate(async () => {
      const keys = await caches.keys();
      const urls: string[] = [];
      for (const key of keys)
        for (const req of await (await caches.open(key)).keys())
          urls.push(new URL(req.url).pathname);
      return urls;
    }),
  ).toEqual(["/offline.html"]);
});
