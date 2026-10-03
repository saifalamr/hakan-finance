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
    ["Ek ödeme", "500", "₺26.000,00"],
  ] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByLabel("Tutar (₺)").fill(amount);
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".payroll-balance")).toContainText(balance);
  }
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
    }
    await page
      .getByRole("link", { name: "Raporlar", exact: false })
      .filter({ has: page.locator(".entity-icon") })
      .click();
    await expect(page.locator("h1")).toHaveText("Raporlar");
    await expect(page.getByRole("img", { name: /Son altı ay/ })).toBeVisible();
    await noOverflow(page);
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
    categories: [
      {
        id: "00000000-0000-0000-0000-000000000010",
        user_id: user.id,
        name: "Yakıt",
        type: "expense",
      },
    ],
  };
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
    } else if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").at(-1)!;
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
      } else body = rows[table];
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
  await page.getByLabel("Tutar (₺)").fill("1250");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".transaction-row")).toContainText("₺1.250,00");
  expect(rows.transactions).toHaveLength(1);
  expect(rows.transactions[0]).toMatchObject({
    amount: 125000,
    user_id: user.id,
    date: today(),
  });
  await page
    .getByRole("button", { name: "Çıkış Yap", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Giriş Yap", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Son İşlemler", { exact: true })).toHaveCount(0);
});
