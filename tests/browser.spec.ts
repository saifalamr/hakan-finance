import { test as base, expect, type Page } from "@playwright/test";
import { today } from "../src/lib/finance";
// Serverless Chromium needs a fresh process for each isolated context.
const test = base.extend({
  context: async (
    { playwright, launchOptions, baseURL, viewport },
    runWithContext,
  ) => {
    const browser = await playwright.chromium.launch(launchOptions);
    const context = await browser.newContext({ baseURL, viewport });
    await runWithContext(context);
    await browser.close();
  },
});
async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Geliştirme demosunu aç" }).click();
  await expect(
    page.getByRole("heading", { name: "Bu Ay", exact: true }),
  ).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Mobil menü" })
    .getByRole("link", { name, exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText(name);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("expense adds, updates, persists and deletes; vehicle total is automatic", async ({
  page,
}) => {
  await demo(page);
  await page
    .getByRole("button", { name: "İşlem Ekle", exact: true })
    .last()
    .click();
  await page.getByLabel("Tutar (₺)").fill("2.500,50");
  await page
    .getByLabel("Kategori", { exact: true })
    .selectOption({ label: "Yakıt" });
  await page.getByRole("button", { name: "Diğer bilgiler" }).click();
  await page.getByLabel("Araç", { exact: true }).selectOption("v1");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Araçlar");
  const card = page.getByRole("link", { name: /34 ABC 123/ });
  await expect(card).toContainText("₺4.900,50");
  await card.click();
  await expect(page.locator("h1")).toHaveText("34 ABC 123");
  const row = page.getByRole("button", { name: "Yakıt, ₺2.500,50, düzenle" });
  await row.click();
  await page.getByLabel("Tutar (₺)").fill("2600");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Yakıt, ₺2.600,00, düzenle" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Geliştirme demosunu aç" }).click();
  await expect(page.locator("h1")).toHaveText("34 ABC 123");
  await expect(
    page.getByRole("button", { name: "Yakıt, ₺2.600,00, düzenle" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yakıt, ₺2.600,00, düzenle" }).click();
  await page.getByRole("button", { name: "İşlemi sil" }).click();
  await page.getByRole("button", { name: "Evet, sil" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Yakıt, ₺2.600,00, düzenle" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Yakıt, ₺2.600,00, düzenle" }),
  ).toBeVisible();
});
test("employee payroll handles advance, deduction, bonus and historical plans", async ({
  page,
}) => {
  await demo(page);
  await nav(page, "Personel");
  await page.getByRole("link", { name: /Ahmet Yılmaz/ }).click();
  await expect(page.locator("h1")).toHaveText("Ahmet Yılmaz");
  await expect(page.locator(".payroll-balance")).toContainText("₺29.000,00");
  for (const [label, amount, balance] of [
    ["Avans", "2000", "₺27.000,00"],
    ["Kesinti", "1000", "₺26.000,00"],
    ["Ödenen prim", "500", "₺26.000,00"],
    ["Prim alacağı", "750", "₺26.750,00"],
  ] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByLabel("Tutar (₺)").fill(amount);
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".payroll-balance")).toContainText(balance);
  }
  await page
    .getByRole("button", { name: "Prim alacağı, ₺750,00, düzenle" })
    .click();
  await page.getByLabel("Personel işlemi").selectOption("bonus");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.locator(".payroll-balance")).toContainText("₺26.000,00");
  await page.getByRole("button", { name: "Önceki ay" }).click();
  await expect(page.getByText("Bu ayın maaş planı yok")).toBeVisible();
  await page
    .getByRole("button", { name: "Maaş planı oluştur", exact: true })
    .click();
  await page.getByLabel("Aylık Maaş (₺)").fill("30000");
  await page.getByLabel("Çalışma Günleri").fill("20");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.locator(".payroll-balance")).toContainText("₺20.000,00");
  await page.getByRole("button", { name: "Sonraki ay" }).click();
  await expect(page.locator(".payroll-balance")).toContainText("₺26.000,00");
});
test("vehicle, employee, category CRUD and Turkish validation", async ({
  page,
}) => {
  await demo(page);
  await nav(page, "Araçlar");
  await page.getByRole("button", { name: "Araç Ekle", exact: true }).click();
  await page.getByLabel("Plaka").fill("06 yeni 1");
  await page.getByLabel("Marka").fill("Renault");
  await page.getByLabel("Model").fill("Clio");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.getByRole("link", { name: /06 YENİ 1/ }).click();
  await expect(page.locator("h1")).toHaveText("06 YENİ 1");
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByLabel("Model").fill("Megane");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("Renault Megane", { exact: true })).toBeVisible();
  await nav(page, "Personel");
  await page
    .getByRole("button", { name: "Personel Ekle", exact: true })
    .click();
  await page.getByLabel("Ad Soyad").fill("Mehmet Kaya");
  await page.getByLabel("Aylık Maaş (₺)").fill("30000");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.getByRole("link", { name: /Mehmet Kaya/ }).click();
  await expect(page.locator(".payroll-balance")).toContainText("₺30.000,00");
  await nav(page, "Daha Fazla");
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await page.getByLabel("Kategori adı").fill("İnternet");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "İnternet Gider" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "İşlem Ekle", exact: true }).click();
  await page.getByLabel("Tutar (₺)").fill("-5");
  await page
    .getByLabel("Kategori", { exact: true })
    .selectOption({ label: "Yakıt" });
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Geçerli bir tutar",
  );
  await page.getByRole("button", { name: "Kapat", exact: true }).click();
});
test("date, type and search filters plus empty states", async ({ page }) => {
  await demo(page);
  await nav(page, "İşlemler");
  await page.getByRole("button", { name: "Özel Tarih", exact: true }).click();
  await page.getByLabel("Başlangıç").fill("2000-01-01");
  await page.getByLabel("Bitiş").fill("2000-01-31");
  await expect(page.getByText("Henüz işlem yok")).toBeVisible();
  await page.getByRole("button", { name: "Bu Ay", exact: true }).click();
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await page.getByLabel("İşlem türü", { exact: true }).selectOption("income");
  await expect(page.locator(".transaction-row")).toHaveCount(2);
  await page.getByLabel("İşlem ara").fill("zzzzz");
  await expect(page.getByText("Henüz işlem yok")).toBeVisible();
  await page.getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(page.locator(".transaction-row")).toHaveCount(5);
});
test("phone widths, desktop, details and touch forms have no horizontal overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await demo(page);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of [
      "Ana Sayfa",
      "İşlemler",
      "Araçlar",
      "Personel",
      "Daha Fazla",
    ]) {
      await page
        .getByRole("navigation", { name: "Mobil menü" })
        .getByRole("link", { name, exact: true })
        .click();
      await expect(page.locator("h1")).toHaveText(
        name === "Ana Sayfa" ? "Bu Ay" : name,
      );
      await noOverflow(page);
      if (name === "Daha Fazla") {
        await page
          .getByRole("button", { name: "Belirle", exact: true })
          .click();
        await noOverflow(page);
        await page
          .getByRole("button", { name: "Belirle", exact: true })
          .click();
      }
    }
    await page
      .getByRole("link", { name: "Raporlar", exact: false })
      .filter({ has: page.locator(".entity-icon") })
      .click();
    await expect(page.locator("h1")).toHaveText("Raporlar");
    await expect(page.getByRole("img", { name: /Son altı ay/ })).toBeVisible();
    await noOverflow(page);
    await page
      .getByRole("button", { name: "Excel İndir", exact: true })
      .click();
    await noOverflow(page);
    await page
      .getByRole("button", { name: "Excel İndir", exact: true })
      .click();
    await page.getByRole("button", { name: "İşlem Ekle", exact: true }).click();
    await page.getByRole("button", { name: "Diğer bilgiler" }).click();
    const dialog = page.getByRole("dialog");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Kapat", exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("navigation", { name: "Ana menü" })
    .getByRole("link", { name: "Ana Sayfa", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bu Ay", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /Ay boyunca/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("duplicate creates a new entry; trash survives reload and can be restored", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Yakıt, ₺2.400,00, düzenle" }).click();
  await page.getByRole("button", { name: "Tekrarla", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Yeni işlem");
  await expect(page.getByLabel("Tutar (₺)")).toHaveValue("2400");
  await expect(page.getByLabel("Tarih", { exact: true })).toHaveValue(today());
  await page.getByLabel("Tutar (₺)").fill("123,45");
  await page.getByLabel("Açıklama").fill("Tekrar testi");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Yakıt, ₺2.400,00, düzenle" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yakıt, ₺123,45, düzenle" }).click();
  await page.getByRole("button", { name: "İşlemi sil" }).click();
  await page.getByRole("button", { name: "Evet, sil" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Geliştirme demosunu aç" }).click();
  await nav(page, "Daha Fazla");
  await expect(page.locator(".trash-row")).toContainText("₺123,45");
  await page.getByRole("button", { name: "Tekrar testi geri yükle" }).click();
  await expect(
    page.getByText("Silinen işlem yok", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobil menü" })
    .getByRole("link", { name: "Ana Sayfa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Yakıt, ₺123,45, düzenle" }),
  ).toBeVisible();
});
test("opening balance persists and Excel download is a styled real workbook", async ({
  page,
}) => {
  await demo(page);
  await nav(page, "Daha Fazla");
  await page.getByRole("button", { name: "Belirle", exact: true }).click();
  await page.getByLabel("Başlangıç tutarı (₺)").fill("5.000,50");
  await page
    .getByLabel("Bakiye başlangıç tarihi")
    .fill(today().slice(0, 7) + "-01");
  await page
    .getByRole("button", { name: "Bakiyeyi kaydet", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Mobil menü" })
    .getByRole("link", { name: "Ana Sayfa", exact: true })
    .click();
  await expect(page.locator(".balance-strip")).toContainText("₺44.400,50");
  await nav(page, "Daha Fazla");
  await page.getByRole("button", { name: "Excel İndir", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Raporu indir", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/finans-.*\.xlsx$/);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(await readFile(path!));
  expect(strFromU8(zip["xl/worksheets/sheet1.xml"])).toContain("44400.5");
  expect(strFromU8(zip["xl/worksheets/sheet2.xml"])).toContain("Depo dolumu");
  expect(strFromU8(zip["xl/styles.xml"])).toContain("294F46");
});
test("authenticated Supabase API reads and writes, logout closes protected content", async ({
  page,
}) => {
  const user = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const rows: Record<string, unknown[]> = {
    transactions: [],
    vehicles: [],
    employees: [],
    employee_periods: [],
    finance_settings: [],
    categories: [
      {
        id: "00000000-0000-0000-0000-000000000010",
        user_id: user.id,
        name: "Yakıt",
        type: "expense",
      },
    ],
  };
  let reads = 0;
  let failRefresh = false;
  const cursors: (string | null)[] = [];
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    let body: unknown = {};
    if (url.pathname === "/auth/v1/token")
      body = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user,
      };
    else if (url.pathname === "/auth/v1/user") body = user;
    else if (url.pathname === "/auth/v1/logout") {
      await route.fulfill({ status: 204 });
      return;
    } else if (url.pathname.startsWith("/rest/v1/rpc/")) {
      await route.fulfill({
        status: 404,
        json: { code: "PGRST202", message: "function not installed" },
      });
      return;
    } else if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").at(-1)!;
      if (request.method() === "GET" && table !== "app_admin") {
        reads++;
        if (failRefresh && table === "transactions") {
          await route.fulfill({
            status: 503,
            json: { message: "temporary failure" },
          });
          return;
        }
      }
      if (table === "finance_settings" || table === "vehicle_documents") {
        await route.fulfill({
          status: 404,
          json: { code: "PGRST205", message: "table not found" },
        });
        return;
      }
      if (table === "app_admin") body = [{ user_id: user.id }];
      else if (request.method() === "POST") {
        const input = request.postDataJSON();
        const saved = {
          ...input,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        };
        rows[table].push(saved);
        body = [saved];
      } else {
        const cursor = url.searchParams.get("id");
        if (table === "transactions") cursors.push(cursor);
        expect(url.searchParams.has("offset")).toBe(false);
        const selected = [...(rows[table] as { id: string }[])].sort((a, b) =>
          a.id.localeCompare(b.id),
        );
        body = selected
          .filter((row) => !cursor || row.id > cursor.slice(3))
          .slice(0, Number(url.searchParams.get("limit") || 500));
      }
    }
    await route.fulfill({ json: body });
  });
  await page.goto("/");
  await page.getByLabel("E-posta").fill("admin@example.test");
  await page.getByLabel("Şifre").fill("test-password");
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bu Ay", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("İlk kaydınızı ekleyerek başlayın."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "İşlem Ekle", exact: true })
    .last()
    .click();
  const readsBeforeSave = reads;
  await page.getByLabel("Tutar (₺)").fill("1250");
  await page
    .getByLabel("Kategori", { exact: true })
    .selectOption({ label: "Yakıt" });
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".transaction-row")).toContainText("₺1.250,00");
  expect(rows.transactions).toHaveLength(1);
  expect(reads).toBe(readsBeforeSave);
  failRefresh = true;
  await page
    .getByRole("button", { name: "Yenile", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Son yüklenen kayıtlar gösteriliyor."),
  ).toBeVisible();
  await expect(page.locator(".transaction-row")).toContainText("₺1.250,00");
  failRefresh = false;
  await page.getByRole("button", { name: "Yeniden dene", exact: true }).click();
  await expect(
    page.getByText("Son yüklenen kayıtlar gösteriliyor."),
  ).toHaveCount(0);
  expect(rows.transactions[0]).toMatchObject({
    amount: 125000,
    user_id: user.id,
    date: today(),
  });
  const original = rows.transactions[0] as Record<string, unknown>;
  rows.transactions.push(
    ...Array.from({ length: 1000 }, (_, i) => ({
      ...original,
      id: `00000000-0000-0000-0001-${String(i).padStart(12, "0")}`,
      amount: 1,
    })),
  );
  cursors.length = 0;
  await page
    .getByRole("button", { name: "Yenile", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("₺1.260,00", { exact: true }).first(),
  ).toBeVisible();
  expect(cursors).toHaveLength(3);
  expect(cursors[0]).toBeNull();
  expect(cursors[1]).toMatch(/^gt\./);
  expect(cursors[2]).toMatch(/^gt\./);
  await nav(page, "İşlemler");
  await expect(page.getByText("1001 kayıt", { exact: true })).toBeVisible();
  await expect(page.locator(".transaction-row")).toHaveCount(40);
  await page
    .getByRole("button", { name: "Daha fazla göster", exact: true })
    .click();
  await expect(page.locator(".transaction-row")).toHaveCount(80);
  await page
    .getByRole("button", { name: "Çıkış Yap", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Giriş Yap", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Son İşlemler", { exact: true })).toHaveCount(0);
});

test("10,000-row Excel export leaves touch forms usable and renders bounded lists", async ({
  page,
}) => {
  const { makeDemo } = await import("../src/lib/demo");
  const data = makeDemo();
  data.transactions = Array.from({ length: 10000 }, (_, i) => ({
    ...data.transactions[0],
    id: `large-${i}`,
    description: `Yerel yük testi ${i}`,
  }));
  await page.addInitScript(
    (fixture) =>
      localStorage.setItem(
        "finance-development-demo-v1",
        JSON.stringify(fixture),
      ),
    data,
  );
  await demo(page);
  await nav(page, "İşlemler");
  await expect(page.locator(".transaction-row")).toHaveCount(40);
  await expect(page.getByText("10000 kayıt", { exact: true })).toBeVisible();
  await nav(page, "Daha Fazla");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/report-template.xlsx", async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Excel İndir", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Raporu indir", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hazırlanıyor…", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "İşlem Ekle", exact: true })
    .last()
    .click();
  await page.getByLabel("Tutar (₺)").fill("99,50");
  await expect(page.getByLabel("Tutar (₺)")).toHaveValue("99,50");
  await noOverflow(page);
  await page.getByRole("button", { name: "Kapat", exact: true }).click();
  release();
  const download = await downloadPromise;
  const { readFile } = await import("node:fs/promises");
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(await readFile((await download.path())!));
  const xml = strFromU8(zip["xl/worksheets/sheet2.xml"]);
  expect(xml).toContain('autoFilter ref="A5:I10005"');
  expect(xml).toContain("Yerel yük testi 9999");
  await expect(page.getByText("Excel raporu indirildi.")).toBeVisible();
});

test("compact fleet status, filters, archive/restore and employee-linked vehicle expense", async ({
  page,
}) => {
  const { makeDemo } = await import("../src/lib/demo");
  const { shiftMonth, currentMonth } = await import("../src/lib/finance");
  const data = makeDemo();
  const month = currentMonth();
  data.vehicles = Array.from({ length: 7 }, (_, i) => ({
    ...data.vehicles[0],
    id: "fleet-" + i,
    model: [
      "Clio",
      "TRANSIT",
      "D-Max",
      "Actros",
      "Qashqai",
      "Caddy",
      "Bilinmeyen",
    ][i],
    plate: "34 QA " + (i + 1),
  }));
  data.transactions = [];
  for (let i = 0; i < 6; i++)
    for (const [offset, amount] of [
      [-2, 100000],
      [-1, 100000],
      [0, i === 0 ? 150000 : i === 1 ? 120000 : 90000],
    ])
      data.transactions.push({
        ...makeDemo().transactions[0],
        id: `fleet-t-${i}-${offset}`,
        type: "expense",
        vehicle_id: "fleet-" + i,
        employee_id: null,
        payroll_kind: null,
        date: shiftMonth(month, offset) + "-01",
        amount,
      });
  await page.addInitScript(
    (f) =>
      localStorage.setItem("finance-development-demo-v1", JSON.stringify(f)),
    data,
  );
  await demo(page);
  await nav(page, "Araçlar");
  await expect(page.locator(".fleet-row")).toHaveCount(7);
  await expect(page.locator(".fleet-row .vehicle-illustration")).toHaveCount(7);
  expect(
    await page
      .locator(".vehicle-illustration")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-shape")),
      ),
  ).toEqual(["car", "van", "pickup", "truck", "suv", "van", "car"]);
  const sizes = await page
    .locator(".fleet-row")
    .evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
  expect(sizes.every((n) => n >= 70 && n <= 100)).toBe(true);
  await page.screenshot({
    path: "test-results/compact-vehicles-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Yüksek Gider", exact: true }).click();
  await expect(page.locator(".fleet-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  await page.getByLabel("Araç ara").fill("34qa7");
  await expect(page.locator(".fleet-row")).toHaveCount(1);
  await page.locator(".fleet-row").click();
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByRole("button", { name: "Arşivle", exact: true }).click();
  await page
    .getByRole("button", { name: "Evet, arşivle", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Yeniden aktif et" }).click();
  await page.getByRole("button", { name: "Gider Ekle", exact: false }).click();
  await expect(page.getByLabel("Araç", { exact: true })).toHaveValue("fleet-6");
  await page.getByLabel("Tutar (₺)").fill("250");
  await page
    .getByLabel("Kategori", { exact: true })
    .selectOption({ label: "Yakıt" });
  await page.getByLabel("Personel", { exact: true }).selectOption("e1");
  await expect(page.getByLabel("Personel işlemi")).toHaveValue("");
  await page.getByRole("button", { name: "Kaydet", exact: true }).dblclick();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  if ((await page.locator("h1").textContent()) === "Araçlar")
    await page.getByRole("link", { name: /34 QA 7/ }).click();
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await nav(page, "Personel");
  await page.getByRole("link", { name: /Ahmet Yılmaz/ }).click();
  await expect(page.locator(".payroll-balance")).toContainText("₺32.000,00");
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByRole("button", { name: "Arşivle", exact: true }).click();
  await page
    .getByRole("button", { name: "Evet, arşivle", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Yeniden aktif et" }).click();
  await noOverflow(page);
});
test("server summary and paged history, receipt upload/open, recurring confirmation and safe double submission", async ({
  page,
}) => {
  test.setTimeout(90000);
  const { businessAPI } = await import("./business-browser-fixture");
  const api = await businessAPI(page, true);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/");
    await page.getByLabel("E-posta").fill("admin@example.test");
    await page.getByLabel("Şifre").fill("test-password");
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("Bu Ay");
    await nav(page, "Araçlar");
    await expect(page.locator(".fleet-row")).toHaveCount(50);
    expect(
      api.calls.some(
        (c) => c.path === "/rest/v1/transactions" && c.method === "GET",
      ),
    ).toBe(false);
    expect(
      api.calls
        .filter((c) => c.path.endsWith("/finance_transactions"))
        .every((c) => c.rows <= 41),
    ).toBe(true);
    await page.getByLabel("Araç ara").fill("34 QA 001");
    await page.locator(".fleet-row").click();
    await expect(page.locator(".detail-numbers")).toContainText("₺1.500,00");
    await page
      .getByRole("button", { name: "Gider Ekle", exact: false })
      .click();
    await expect(page.getByLabel("Araç", { exact: true })).toHaveValue(
      api.vehicles[0].id,
    );
    await page.getByLabel("Tutar (₺)").fill("123,45");
    await page.getByLabel("Kategori", { exact: true }).selectOption(api.fuel);
    await page.getByLabel("Fiş / Fatura (isteğe bağlı)").setInputFiles({
      name: "receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% local test receipt\n%%EOF"),
    });
    let release!: () => void;
    api.hold(new Promise<void>((resolve) => (release = resolve)));
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Kaydediliyor…", exact: true }),
    ).toBeDisabled();
    release();
    api.hold(null);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = (
      await api.db.query<{ row: { id: string; receipt_path: string } }>(
        "select to_jsonb(t)row from transactions t where receipt_path is not null",
      )
    ).rows;
    expect(saved).toHaveLength(1);
    expect(saved[0].row.receipt_path).toContain(saved[0].row.id);
    await page.getByRole("button", { name: "Yakıt, ₺123,45, düzenle" }).click();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Belgeyi aç", exact: true }).click();
    const opened = await popup;
    await expect
      .poll(() => opened.url())
      .toContain("/object/sign/finance-receipts/");
    await opened.close();
    await page.getByLabel("Fiş / Fatura (isteğe bağlı)").setInputFiles({
      name: "small.png",
      mimeType: "image/png",
      buffer: await page.screenshot({
        clip: { x: 0, y: 0, width: 1, height: 1 },
      }),
    });
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const objects = (
      await api.db.query<{ name: string }>("select name from storage.objects")
    ).rows;
    expect(objects).toHaveLength(1);
    expect(objects[0].name).toMatch(/\.jpg$/);

    await nav(page, "Daha Fazla");
    await page
      .getByRole("button", { name: "Tekrarlayan Gider Ekle", exact: true })
      .click();
    await page.getByLabel("Gider adı").fill("Yerel kira");
    await page.getByLabel("Tutar (₺)").fill("500");
    await page
      .getByRole("dialog")
      .getByLabel("Kategori", { exact: true })
      .selectOption(api.fuel);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Kaydet", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const schedule = page
      .locator(".recurring-row")
      .filter({ hasText: "Yerel kira" });
    await schedule.getByRole("button", { name: "Kaydet", exact: true }).click();
    await page
      .getByRole("button", { name: "Gideri kaydet", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      (
        await api.db.query(
          "select id from transactions where recurring_id is not null",
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      schedule.getByRole("button", { name: "Kaydet", exact: true }),
    ).toBeDisabled();
    await noOverflow(page);
    await nav(page, "İşlemler");
    await expect(page.locator(".transaction-row")).toHaveCount(40);
    await page
      .getByRole("button", { name: "Daha fazla göster", exact: true })
      .click();
    await expect(page.locator(".transaction-row")).toHaveCount(80);
    await page.getByLabel("İşlem ara").fill("Yerel kira");
    await expect(page.locator(".transaction-row")).toHaveCount(1);
    await page.getByRole("button", { name: "Temizle", exact: true }).click();
    await expect(page.locator(".transaction-row")).toHaveCount(40);
    await nav(page, "Daha Fazla");
    await page
      .getByRole("button", { name: "Excel İndir", exact: true })
      .click();
    await page.getByLabel("Dosya biçimi").selectOption("csv");
    const csvDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Raporu indir", exact: true })
      .click();
    const csv = await csvDownload;
    const { readFile } = await import("node:fs/promises");
    const text = await readFile((await csv.path())!, "utf8");
    expect(text).toContain("Yerel stress 20000");
    expect(text).toContain("Yerel kira");
    expect(text).toContain("Personel İşlemi");
    await nav(page, "Araçlar");
    await expect(page.locator(".fleet-row")).toHaveCount(50);
    await page.route("**/rest/v1/rpc/finance_summary", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: "XX000", message: "summary unavailable" }),
      }),
    );
    await page.getByRole("button", { name: "Sonraki ay", exact: true }).click();
    await expect(page.locator('.panel.form-error[role="alert"]')).toBeVisible();
    await expect(page.locator(".fleet-row")).toHaveCount(0);
    await expect(page.locator(".fleet-summary")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await api.db.close();
  }
});

test("vehicle documents: expiry priorities, date edits, private upload/replace/remove and mobile density", async ({
  page,
}) => {
  test.setTimeout(90000);
  // Model a busy phone: chart measurement may arrive after the viewport changes.
  await page.addInitScript(() => {
    const NativeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) =>
          setTimeout(() => callback(entries, observer), 150),
        );
      }
    };
  });
  const { businessAPI } = await import("./business-browser-fixture");
  const { admin } = await import("./business-fixture");
  const api = await businessAPI(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const date = (days: number) => {
    const d = new Date(today() + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  try {
    for (const type of ["ruhsat", "muayene", "sigorta", "kasko"]) {
      await api.db.query(
        "insert into vehicle_documents(user_id,vehicle_id,type,start_date,end_date,notes)values($1,$2,$3,$4,$5,$6)",
        [
          admin,
          api.vehicles[1].id,
          type,
          type === "ruhsat" ? null : date(-50),
          type === "ruhsat" ? null : date(90),
          type === "ruhsat" ? "Ruhsat mevcut" : null,
        ],
      );
    }
    for (const [index, type, days] of [
      [2, "muayene", 30],
      [3, "muayene", -3],
      [3, "sigorta", 5],
      [4, "sigorta", -2],
      [4, "kasko", 7],
      [5, "kasko", -1],
      [6, "sigorta", 15],
    ] as const)
      await api.db.query(
        "insert into vehicle_documents(user_id,vehicle_id,type,end_date)values($1,$2,$3,$4)",
        [admin, api.vehicles[index].id, type, date(days)],
      );
    await api.db.query(
      "update vehicles set plate=$1,brand=$2,model=$3 where id=$4",
      [
        "34 UZUN 123456789012",
        "Uzun marka ".repeat(5).trim(),
        "Uzun model ".repeat(5).trim(),
        api.vehicles[0].id,
      ],
    );
    await page.goto("/");
    await page.getByLabel("E-posta").fill("admin@example.test");
    await page.getByLabel("Şifre").fill("test-password");
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("Bu Ay");
    await nav(page, "Araçlar");
    await expect(page.locator(".fleet-row")).toHaveCount(7);
    await expect(
      page.getByRole("button", { name: "Belge Uyarısı: 5", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".fleet-row").filter({ hasText: "34 QA 004" }),
    ).toContainText("Muayene süresi doldu");
    await expect(
      page.locator(".fleet-row").filter({ hasText: "34 QA 005" }),
    ).toContainText("Sigorta süresi doldu");
    await expect(
      page.locator(".fleet-row").filter({ hasText: "34 QA 006" }),
    ).toContainText("Kasko süresi doldu");
    await page
      .getByRole("button", { name: "Belge Uyarısı: 5", exact: true })
      .click();
    await expect(page.locator(".fleet-row")).toHaveCount(5);
    await page
      .getByRole("button", { name: "Belge Uyarısı: 5", exact: true })
      .click();
    await page.locator(".vehicle-upcoming > summary").click();
    await expect(page.locator(".document-upcoming-row")).toHaveCount(7);
    await expect(page.locator(".document-upcoming-row").first()).toContainText(
      "34 QA 004",
    );
    await page.locator(".fleet-row").filter({ hasText: "34 QA 002" }).click();
    await expect(
      page.locator(".vehicle-document-row .document-state.normal"),
    ).toHaveCount(4);
    await nav(page, "Araçlar");
    await page.locator(".fleet-row").filter({ hasText: "34 UZUN" }).click();
    await expect(
      page.locator(".vehicle-document-row .document-state.neutral"),
    ).toHaveCount(4);
    await expect(page.locator(".detail-numbers")).toContainText("₺1.500,00");
    await page
      .getByRole("button", { name: "Muayene düzenle", exact: true })
      .click();
    await page.getByLabel("Başlangıç Tarihi", { exact: true }).fill(date(10));
    await page
      .getByLabel("Bitiş / Geçerlilik Tarihi", { exact: true })
      .fill(date(5));
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "önce olamaz",
    );
    await page.getByLabel("Başlangıç Tarihi", { exact: true }).fill(date(-100));
    await page
      .getByLabel("Bitiş / Geçerlilik Tarihi", { exact: true })
      .fill(date(10));
    await page.getByLabel("Belge / Fotoğraf (isteğe bağlı)").setInputFiles({
      name: "muayene.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% local test\n%%EOF"),
    });
    let release!: () => void;
    api.hold(new Promise<void>((r) => (release = r)));
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Kaydediliyor…", exact: true }),
    ).toBeDisabled();
    release();
    api.hold(null);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('[data-document-type="muayene"]')).toContainText(
      "10 gün kaldı",
    );
    const saved = (
      await api.db.query<{ id: string; file_path: string }>(
        "select id,file_path from vehicle_documents where vehicle_id=$1",
        [api.vehicles[0].id],
      )
    ).rows;
    expect(saved).toHaveLength(1);
    expect(saved[0].file_path).toContain(`/${api.vehicles[0].id}/muayene/`);
    const popup = page.waitForEvent("popup");
    await page
      .getByRole("button", { name: "Muayene belgesini aç", exact: true })
      .click();
    const opened = await popup;
    await expect
      .poll(() => opened.url())
      .toContain("/object/sign/vehicle-documents/");
    await opened.close();
    await page
      .getByRole("button", { name: "Muayene düzenle", exact: true })
      .click();
    await page.getByLabel("Belge / Fotoğraf (isteğe bağlı)").setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: await page.screenshot({
        clip: { x: 0, y: 0, width: 1, height: 1 },
      }),
    });
    await page
      .getByLabel("Bitiş / Geçerlilik Tarihi", { exact: true })
      .fill(today());
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('[data-document-type="muayene"]')).toContainText(
      "Süresi doldu",
    );
    let objects = (
      await api.db.query<{ name: string }>(
        "select name from storage.objects where bucket_id='vehicle-documents'",
      )
    ).rows;
    expect(objects).toHaveLength(1);
    expect(objects[0].name).toMatch(/\.jpg$/);
    await page
      .getByRole("button", { name: "Muayene düzenle", exact: true })
      .click();
    await page.getByLabel("Mevcut eki kaldır").check();
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Muayene belgesini aç", exact: true }),
    ).toHaveCount(0);
    objects = (
      await api.db.query<{ name: string }>(
        "select name from storage.objects where bucket_id='vehicle-documents'",
      )
    ).rows;
    expect(objects).toHaveLength(0);
    await page
      .getByRole("button", { name: "Trafik Sigortası düzenle", exact: true })
      .click();
    await page.getByLabel("Başlangıç Tarihi", { exact: true }).fill(today());
    await page
      .getByLabel("Bitiş / Geçerlilik Tarihi", { exact: true })
      .fill(date(60));
    await page
      .getByLabel("Şirket / Sağlayıcı (isteğe bağlı)")
      .fill("Uzun şirket adı ".repeat(6));
    await page
      .getByLabel("Poliçe Numarası (isteğe bağlı)")
      .fill("POL-".repeat(25));
    const failure = async (route: import("@playwright/test").Route) =>
      route.fulfill({
        status: 400,
        json: {
          message: "Upload failed",
          statusCode: "400",
          error: "Storage error",
        },
      });
    await page.route("**/storage/v1/object/vehicle-documents/**", failure);
    await page.getByLabel("Belge / Fotoğraf (isteğe bağlı)").setInputFiles({
      name: "fail.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF"),
    });
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    expect(
      (
        await api.db.query(
          "select id from vehicle_documents where vehicle_id=$1 and type='sigorta'",
          [api.vehicles[0].id],
        )
      ).rows,
    ).toHaveLength(0);
    await page.unroute("**/storage/v1/object/vehicle-documents/**", failure);
    await page.getByLabel("Belge / Fotoğraf (isteğe bağlı)").setInputFiles([]);
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const width of [320, 360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page);
      if (width === 390)
        await page.screenshot({
          path: "test-results/vehicle-documents-mobile.png",
          fullPage: true,
        });
      await page
        .getByRole("button", { name: "Trafik Sigortası düzenle", exact: true })
        .click();
      await noOverflow(page);
      await page.getByRole("button", { name: "Kapat", exact: true }).click();
      if (width >= 768) {
        await page.goto("/araclar");
        await expect(page.locator("h1")).toHaveText("Araçlar");
      } else await nav(page, "Araçlar");
      await noOverflow(page);
      const heights = await page
        .locator(".fleet-row")
        .evaluateAll((rows) =>
          rows.map((row) => row.getBoundingClientRect().height),
        );
      expect(heights.every((height) => height >= 70 && height <= 100)).toBe(
        true,
      );
      await page.locator(".fleet-row").filter({ hasText: "34 UZUN" }).click();
    }
    expect(errors).toEqual([]);
  } finally {
    await api.db.close();
  }
});

test("navigation return links, contextual quick entry and safe vehicle deletion", async ({
  page,
}) => {
  test.setTimeout(60000);
  const { businessAPI } = await import("./business-browser-fixture");
  const api = await businessAPI(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/");
    await page.getByLabel("E-posta").fill("admin@example.test");
    await page.getByLabel("Şifre", { exact: true }).fill("local-test-password");
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("Bu Ay");
    await nav(page, "Daha Fazla");
    await page.getByRole("link", { name: /Raporlar/ }).click();
    await expect(page.locator("h1")).toHaveText("Raporlar");
    await expect(
      page
        .getByRole("navigation", { name: "Mobil menü" })
        .getByRole("link", { name: "Daha Fazla", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.locator(".section-back").click();
    await expect(page.locator("h1")).toHaveText("Daha Fazla");
    await page.goto("/araclar/not-a-uuid");
    await expect(
      page.getByRole("heading", { name: "Sayfa bulunamadı" }),
    ).toBeVisible();
    await page.locator(".section-back").click();
    await expect(page.locator("h1")).toHaveText("Araçlar");
    await page.getByRole("button", { name: "Araç Ekle", exact: true }).click();
    await page.getByLabel("Plaka", { exact: true }).fill("34 REMOVE");
    await page.getByLabel("Marka", { exact: true }).fill("Renault");
    await page.getByLabel("Model", { exact: true }).fill("Clio");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator(".fleet-row").filter({ hasText: "34 REMOVE" }).click();
    await expect(page.locator(".section-back")).toHaveText("Araçlar");
    await page.getByRole("button", { name: "İşlem Ekle", exact: true }).click();
    await expect(page.getByLabel("Araç", { exact: true })).toHaveValue(
      (
        await api.db.query<{ id: string }>(
          "select id from vehicles where plate='34 REMOVE'",
        )
      ).rows[0].id,
    );
    await page.getByRole("button", { name: "Kapat", exact: true }).click();
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await page.getByRole("button", { name: "Aracı sil", exact: true }).click();
    await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
    expect(
      (await api.db.query("select id from vehicles where plate='34 REMOVE'"))
        .rows,
    ).toHaveLength(1);
    await page.getByRole("button", { name: "Aracı sil", exact: true }).click();
    let release!: () => void;
    api.hold(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    await page
      .getByRole("button", { name: "Evet, aracı sil", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Siliniyor…", exact: true }),
    ).toBeDisabled();
    release();
    api.hold(null);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("h1")).toHaveText("Araçlar");
    expect(
      (await api.db.query("select id from vehicles where plate='34 REMOVE'"))
        .rows,
    ).toHaveLength(0);
    expect(
      api.calls.filter((call) => call.path.endsWith("/delete_unused_vehicle")),
    ).toHaveLength(1);
    await page.locator(".fleet-row").first().click();
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await page.getByRole("button", { name: "Aracı sil", exact: true }).click();
    await page
      .getByRole("button", { name: "Evet, aracı sil", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "arşivleyin",
    );
    await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
    await page.getByRole("button", { name: "Arşivle", exact: true }).click();
    await page
      .getByRole("button", { name: "Evet, arşivle", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator(".section-back").click();
    await expect(page.locator(".fleet-row")).toHaveCount(6);
    await page.getByRole("button", { name: "Arşiv", exact: true }).click();
    await expect(page.locator(".fleet-row")).toHaveCount(1);
    await page.goto("/personel/00000000-0000-0000-0000-000000000099");
    await expect(
      page.getByRole("heading", { name: "Personel bulunamadı" }),
    ).toBeVisible();
    await page.locator(".section-back").click();
    await expect(page.locator("h1")).toHaveText("Personel");
    await page.locator(".staff-row").first().click();
    await page.getByRole("button", { name: "İşlem Ekle", exact: true }).click();
    await expect(page.getByLabel("Personel", { exact: true })).toHaveValue(
      api.employee,
    );
    await page.getByRole("button", { name: "Kapat", exact: true }).click();
    await page.locator(".section-back").click();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/raporlar");
      await expect(page.locator("h1")).toHaveText("Raporlar");
      await expect(page.locator(".section-back")).toBeVisible();
      await noOverflow(page);
    }
    expect(errors).toEqual([]);
  } finally {
    await api.db.close();
  }
});
