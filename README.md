# hakan-finance

A mobile-first, Turkish finance app for one business owner. Next.js App Router, TypeScript, Tailwind CSS, Supabase/PostgreSQL, Lucide and Recharts. The name, icon and quiet green palette are temporary and can be changed independently of functionality.

## Included

- Current-month income, expenses, net balance, daily cash-flow chart and recent transactions.
- Quick income/expense entry, editing, confirmed deletion, date/type/vehicle/employee filters and search.
- Compact vehicle lists, search/status filters/sorting, creation/editing/archiving/restoring, monthly/lifetime expenses and category distribution.
- Employees, monthly salary snapshots, days worked, salary payments, advances, extra payments and noncash deductions.
- Six-month income/expense report; selected-month category, vehicle and payroll breakdowns.
- Editable income/expense categories, Turkish currency/date formatting, keyboard-accessible dialogs and mobile navigation.
- Password sign-in for one administrator, database RLS and relationship constraints.
- PWA manifest, Android/maskable/iOS icons and a public offline fallback. **An internet connection is required to read or save financial records.** No authenticated pages or financial API responses are cached by the service worker.

## Local development

Requires Node.js 22.13+ (tested with Node 24).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set both Supabase environment variables to connect to a real project. Without them the app shows a setup screen, never fake production balances.

For an isolated **development-only** demo, set `NEXT_PUBLIC_ENABLE_DEMO=true` in `.env.local` and press **Geliştirme demosunu aç**. Demo records stay in this browser, use a separate localStorage key, and never touch Supabase. Clear them under Daha Fazla. Demo access is compiled out of production even if the flag is accidentally set. After a reload, press the demo button again to restore saved development records. No fake transaction seed is executed on a real database.

## Supabase setup

Use a new/dedicated Supabase project for this app.

1. Run the SQL migrations in filename order in Supabase SQL Editor (or apply through the Supabase CLI). Existing installations apply only migrations not yet installed: `20261003184712_finance_improvements.sql`, then `20261003210828_business_finance.sql`. Both preserve financial records. Never rerun the initial schema on an existing database. Before the business migration, the application keeps compatible legacy reads and working forms; receipt upload, recurring expenses and archiving wait for it. After migration, the application detects the new RPC and switches to server aggregates/pagination automatically.
2. In Authentication → Users, manually create the owner's email/password user. Mark the email confirmed if creating it administratively. Disable **Allow new users to sign up** and anonymous sign-ins. There is no public signup page.
3. Copy that user's UUID. In `supabase/setup-admin.sql`, replace `ADMIN_USER_UUID` with the UUID and run the script. It registers exactly one admin and adds the ordinary empty finance categories. It inserts no fake cash records.
4. In Authentication → URL Configuration, set Site URL to the eventual Vercel HTTPS URL. Configure any desired local development URL separately.
5. In the Data API settings ensure `public` is exposed. The migration grants table access only to `authenticated` and enables owner-specific RLS on **every** table. It gives the frontend read-only access to its `app_admin` row. Other logged-in users cannot see or write finance records and cannot promote themselves.
6. Use the project's URL and **publishable** key in the two environment variables below. No service role/secret key is required.

If an admin login succeeds but the account is not listed in `app_admin`, the app denies access. Do not weaken RLS to fix setup mistakes.

## Vercel

Import the `hakan-finance` repository, choose the Next.js preset and root directory `/`. Use the default build command `npm run build`. Set the following in Vercel's Production environment, and optionally Preview for a separate test project:

| Variable                               | Value                               |
| -------------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project's publishable key  |

These are public browser connection settings; authorization is enforced by PostgreSQL RLS. **Never add `service_role`, Supabase secret keys or real passwords to this repository or a `NEXT_PUBLIC_` variable.** `.env.local` is gitignored; `.env.example` contains placeholders only.

Redeploy after changing public environment variables, because Next.js embeds them at build time. PWA installation works over HTTPS: iOS Safari → Share → Add to Home Screen; Android Chrome → Install app/Add to Home Screen.

## Database

All money is stored as whole **kuruş** in `bigint` (₺2.500,50 = 250050), eliminating fractional binary floating-point storage. Foreign keys include `user_id` so linked records must belong to the same admin. Records used by a transaction cannot be deleted. All transaction reads are paginated; records beyond the API's first response are included in totals.

| Table                | Purpose                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `app_admin`          | One allowed auth user (database singleton constraint).                                                                        |
| `transactions`       | Cash income/expenses and noncash payroll deductions; category, date, vehicle/employee links and optional payroll kind/period. |
| `vehicles`           | Unique plate, brand and model.                                                                                                |
| `employees`          | Name and default monthly salary/days for future plans.                                                                        |
| `employee_periods`   | One salary/days snapshot per employee/calendar month.                                                                         |
| `finance_settings`   | One signed opening cash balance and effective start date per admin. Owner RLS; no client deletion.                            |
| `recurring_expenses` | Owner-confirmed repeating expense definitions, anchored dates and archive state.                                              |
| `categories`         | Admin's income and expense categories.                                                                                        |

### Payroll rules

- Working days are **0–30**, using a fixed 30-day payroll convention. A full month is 30 days, including a 31-day calendar month. Base entitlement = monthly salary ÷ 30 × working days, rounded to the nearest kuruş. Set 30 for a full salaried month.
- Creating an employee atomically creates the current month's salary plan through a PostgreSQL trigger. For another month, save its plan before recording payroll payments. Each plan can be edited explicitly, changing that month's entitlement. Changing an employee's default salary does not rewrite saved historical plans.
- **Maaş ödemesi** and **Avans** are expense transactions and reduce the selected month's remaining amount.
- **Ödenen prim** means an additional entitlement paid immediately: it increases entitlement and paid cash equally, so it does not change the remaining base salary. It is included in cash expenses and total staff payments.
- **Prim alacağı** (`bonus_due`) is earned but unpaid: it increases remaining payroll, never cash expenses. When that same bonus is paid, edit its existing record to **Ödenen prim**, keeping its payroll month. Do not add another bonus record, which would count the entitlement twice.
- **Kesinti** reduces entitlement only; it is stored as `adjustment`, never included in cash expenses/charts/net balance.
- Remaining = prorated base salary + extra earned − deductions − salary payments − advances − extra paid. Negative remaining is shown as **Fazla Ödeme**.
- Other transactions with an employee attached appear in the employee's history but do not reduce salary unless a payroll kind is selected. The form labels these **Diğer gider (maaşa dahil değil)**.
- Payroll month comes from the transaction's date. No automatic payroll carryover is assumed. **Net Bakiye** is net cash flow for the selected month. **Güncel Bakiye** is the configured opening balance before entries on the opening date, plus cash entries from that date through today. Entries before the opening date, future entries, adjustments and deleted entries are excluded.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
E2E_PRODUCTION=true npm run test:e2e
```

`npm test` executes finance calculations and the actual SQL schema in embedded PostgreSQL (PGlite), including RLS, invalid payroll/category relationships, historical salary preservation, restricted deletion and forbidden user access. Browser tests cover CRUD, employee math, dates/filters, Supabase client requests with a controlled API mock, logout, phone widths 320/360/390/430 and desktop 1440. Production tests verify demo absence, protection of deep links, PWA asset availability and public-only offline cache.

If using a preinstalled Chromium, set `CHROMIUM_EXECU…1754 tokens truncated…s (needed for payroll), then restrict cash sheets to the exact chosen dates. A single owner-scoped `finance_export` SQL statement supplies transactions, labels, salary periods and the end-date balance from one consistent snapshot, rather than mixing separately fetched pages. Exports are limited to 50,000 records per request; choose shorter ranges beyond that. XLSX generation runs in a disposable Web Worker with a two-minute deadline. CSV uses Turkish columns/dates/amounts, UTF-8 BOM and formula-safe literal text. Neither export is stored on Supabase or sent to an external export service.

Tests exercise actual PostgreSQL migrations/RLS/constraints and compare SQL totals with shared compatibility formulas. Browser tests include 7-vehicle density/status/filter/archive flows, 50 vehicles and 20,000 PostgreSQL-backed synthetic transactions, bounded API page responses, receipt upload/signed opening, recurring confirmation and saving protection. The existing 50,000-row local calculation/XLSX stress check remains. These fixtures never touch production. They are regression checks, not a guarantee for every phone, network or hosted database.

Check Supabase **Reports → Database size / Disk usage** periodically. `supabase/diagnostics/storage-usage.sql` provides read-only size/index/dead-tuple diagnostics. Do not disable autovacuum, routinely run VACUUM FULL or delete financial history to reduce quota. Database size and disk usage (including WAL/system files) differ. No credentials or report content are stored by diagnostics.

### Vehicle documents and renewal dates

Apply `supabase/migrations/20261004145726_vehicle_documents.sql` **after the three existing migrations**, once. It adds an owner-scoped `vehicle_documents` table with one current record per vehicle/type (`ruhsat`, `muayene`, `sigorta`, `kasko`). All dates, notes and attachments are optional; inspection/insurance dates support both start and end. Insurance provider/policy number are optional. Dates are validated in both the form and PostgreSQL. Vehicle deletion is restricted and archiving retains documents. Existing financial tables and calculations are unchanged.

**Araçlar → vehicle → Belgeler & Tarihler** lets the administrator edit dates/notes, upload or replace a file, remove its attachment and open it later. Fleet rows retain their compact height and show the most urgent expiration on their secondary line. **Belge Uyarısı** filters active vehicles needing attention; **Yaklaşan Tarihler** lists their approaching/expired dates by urgency. No missing data is presented as valid.

Status is centralized in `src/lib/vehicle-documents.ts`: more than 30 calendar days is green, 1–30 is amber, the expiry date itself and earlier dates are red. Missing end dates and future-start documents are neutral. Calendar differences use Istanbul's current date and UTC date-only arithmetic, avoiding time-of-day/DST rounding errors. The configurable threshold is `DOCUMENT_WARNING_DAYS`.

The migration provisions a separate **private** `vehicle-documents` Storage bucket and owner/vehicle policies. Existing receipt validation/compression is reused: images are resized/compressed locally; stored JPEG/PDF files are limited to 2MiB, input images to 10MB. Viewing uses 60-second signed links. Files have immutable owner/vehicle/type paths. Only unreferenced files can be removed; replacing/removing an attachment never removes historical financial data. A dedicated unexposed `vehicle_document_internal` quota helper limits this bucket to 500 objects/200MiB per owner, independently of receipts. Database and Storage quotas remain separate; this is a bound on uploads, not unlimited capacity. No new environment variables are required, and the bucket must not be made public.

Before the migration is installed, existing screens remain usable and the document section displays a setup message. Test fixtures apply all migrations to isolated PostgreSQL and cover owner isolation, date constraints, private files, replacement/removal, expiry boundaries, priority/filter ordering and compact mobile layouts; no fixture writes to production.

### Navigation and safe vehicle removal

Vehicle/personnel detail pages share a persistent parent return link, including empty/error states. Reports return to Daha Fazla; unknown paths return home. Menu selection matches the actual section. The floating İşlem Ekle button preselects only the open **active** vehicle/employee. Archived or missing entities are never implicitly linked.

**Araçlar → vehicle → Düzenle → Aracı sil** confirms permanent removal of an unused vehicle. Apply `20261005100217_safe_vehicle_deletion.sql` after the four previous migrations. It adds only `delete_unused_vehicle(uuid)`; installing it deletes nothing. Direct client DELETE on financial entities remains revoked. The narrowly scoped SECURITY DEFINER RPC validates the current provisioned administrator, locks the owned vehicle, rejects any transaction (including trash), recurring expense, document record or scoped Storage object, and then removes only that unused vehicle. FK restrictions remain in force. Repeated explicit requests for an already removed ID are harmless. Referenced vehicles must be archived and can be restored; employee salary history also remains protected through archiving. No new environment variables are required. Before this migration, attempting permanent removal displays a Turkish setup message and existing archiving still works.

### Araç silme düzeltmesi

`20261005131126_fix_vehicle_delete_owner_ambiguity.sql` dosyasını önceki migration dosyalarından sonra çalıştırın. Supabase Storage `owner_id` sütunu ile fonksiyon değişkeni arasındaki isim çakışmasını düzeltir. Kurulum sırasında veri silmez; bağlı geçmişi olan araçlar için arşivleme zorunluluğu korunur.
