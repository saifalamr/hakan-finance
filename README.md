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

If using a preinstalled Chromium, set `CHROMIUM_EXECUTABLE_PATH`. A live Supabase project's configuration, password login and deployed HTTPS installability should also be checked after provisioning; the embedded database and mocked API tests do not claim to test an unconfigured hosted project.

## Recoverable deletion and Excel export

Transactions move to **Daha Fazla → Silinen İşlemler** with `deleted_at`; they are excluded from all active lists, totals and exports. **Geri al** restores the latest deletion immediately, and the trash list survives reload. Permanent transaction deletion is revoked for authenticated clients. Linked vehicles, staff, salary plans and categories remain protected while a transaction is in trash, so restoring cannot lose its context.

Use **Tekrarla** inside a transaction to open a new transaction with the same amount, category, notes and links, dated today. Review it and save; the original stays intact.

**Excel İndir** on Raporlar/Daha Fazla downloads one `.xlsx` with **Özet, İşlemler, Araçlar, Personel, Kategoriler**. Select an inclusive date range. Cash tabs use exact dates; payroll uses full calendar months intersecting that range, labeled in the workbook. All amounts are numeric TRY values, dates are Excel serials, descriptions are escaped text, and summary/subtotal formulas have cached values. Header rows are frozen, detail sheets have autofilters, rows alternate restrained colors, totals are highlighted. Exports include only actual active app data, and work without the schema upgrade. `public/report-template.xlsx` is a reviewed blank template authored with Artifact Tool, populated in the browser on demand using ZIP/XML utilities. No finance data is uploaded to an export service. Excel decimal/thousands separators follow the reader's Excel locale; Turkish users see Turkish formatting.

No new environment variables are needed. The private `finance-receipts` bucket and its owner policies are provisioned by the business migration; do not manually make the bucket public.

### Business workflow and status logic

`20261003210828_business_finance.sql` adds `archived_at` to vehicles/employees, immutable receipt paths and request/recurrence IDs to transactions, and `recurring_expenses` with owned foreign keys. All table changes are additive. Salary snapshot deletion changes from cascade to restrict; authenticated entity/period DELETE is revoked. Existing linked records, including trash, remain intact. Archived entities stay available in old reports and can be restored. New links to them are rejected by database triggers.

Vehicle status compares the selected month's **full recorded total** with the mean of positive expense months among the preceding three completed months. At least two positive historical months are required. ≤110% is Normal, >110% Dikkat, >135% Yüksek Gider; otherwise neutral. This is a spending indicator, not a mechanical diagnosis or a forecast of the unfinished month. It is centralized in `src/lib/business.ts`. Fleet summary covers active vehicles; reports include archived vehicles with financial activity.

Employee status is neutral without a saved monthly plan, green for zero remaining, amber for a current/future month's outstanding balance, red for an earlier month's outstanding balance or overpayment. No contractual due day or automatic carryover is invented. Selecting an employee alone never turns a vehicle/general expense into payroll. Payroll kind must be chosen explicitly.

### Receipts and recurring expenses

Optional JPEG/PNG/WebP images are resized to a maximum 1600px edge and JPEG-compressed on the device; input is at most 10MB and decoded pixels at most 40 million. The stored result and PDFs must be ≤2MiB. MIME/signature checks reject unsupported/disguised files. The private Storage bucket independently enforces MIME and 2MiB limits. Transaction rows store only an owner/transaction-scoped object path. Signed viewing links expire after 60 seconds. Soft deletion retains receipts for recovery; replacing/removing the reference allows the old object to be deleted. Failed unreferenced uploads are cleaned when possible.

Uploads are limited to 500 objects and a conservative 200MiB owner byte budget (each new upload reserves its maximum 2MiB). A narrowly scoped `SECURITY DEFINER` helper returns only an authorized owner's quota boolean and serializes concurrent upload checks; it cannot return objects or grant financial access. All financial reads/writes/RPC remain `SECURITY INVOKER` under RLS. **Database quota and Storage quota are separate.** Retained history/receipts still require capacity planning; the app cannot guarantee infinite storage or uninterrupted service.

Recurring expenses store amount, expense category, weekly/monthly/yearly frequency, next date, original day/month anchors and optional vehicle/personnel links. They appear under Daha Fazla. The owner explicitly confirms a due occurrence after payment. `post_recurring` locks the schedule, inserts one occurrence, advances its date atomically, and is idempotent for the same schedule/due date. Future dates cannot be posted. January 31 advances to February's last day and then March 31. Payroll recurrence requires that month's saved payroll plan. There is no cron job, actual bank transfer or unattended accounting automation.

### Performance and capacity

After the business migration, `finance_summary` returns exact monthly totals, six-month trend, full daily buckets, lifetime vehicle totals and selected-month employee entitlements in one owner-scoped SQL snapshot. Screens do not fetch years of transaction rows to calculate numbers. Up to four month snapshots are deduplicated per browser session and invalidated after writes. `finance_balance` is the shared SQL source for today's balance and report end-date balances.

`finance_transactions` applies dates/type/entity/search/trash filters in PostgreSQL and returns 40 rows per screen page plus one lookahead row, exact matching totals/count, and a `(date,created_at,id)` keyset cursor. Lists render progressively, searches debounce by 150ms, fleet/staff search uses deferred values. Partial live-row page/vehicle/employee indexes support these paths. Database totals use integer kuruş/numeric intermediates; adjustments are excluded from cash totals. Full history reads remain only as compatibility behavior before migration.

Writes merge acknowledged rows rather than reloading history. Refreshes coalesce and cancel on mutation/sign-out. Individual requests have a 15-second deadline and refresh a 90-second budget. Errors retain the last successfully loaded records with a visible retry. Submit guards and disabled buttons prevent double taps; inserted IDs are retained for an explicit retry after an ambiguous timeout. Database uniqueness blocks duplicate request IDs and recurring occurrences. No write is automatically retried.

Excel/CSV exports explicitly fetch only selected full calendar months (needed for payroll), then restrict cash sheets to the exact chosen dates. A single owner-scoped `finance_export` SQL statement supplies transactions, labels, salary periods and the end-date balance from one consistent snapshot, rather than mixing separately fetched pages. Exports are limited to 50,000 records per request; choose shorter ranges beyond that. XLSX generation runs in a disposable Web Worker with a two-minute deadline. CSV uses Turkish columns/dates/amounts, UTF-8 BOM and formula-safe literal text. Neither export is stored on Supabase or sent to an external export service.

Tests exercise actual PostgreSQL migrations/RLS/constraints and compare SQL totals with shared compatibility formulas. Browser tests include 7-vehicle density/status/filter/archive flows, 50 vehicles and 20,000 PostgreSQL-backed synthetic transactions, bounded API page responses, receipt upload/signed opening, recurring confirmation and saving protection. The existing 50,000-row local calculation/XLSX stress check remains. These fixtures never touch production. They are regression checks, not a guarantee for every phone, network or hosted database.

Check Supabase **Reports → Database size / Disk usage** periodically. `supabase/diagnostics/storage-usage.sql` provides read-only size/index/dead-tuple diagnostics. Do not disable autovacuum, routinely run VACUUM FULL or delete financial history to reduce quota. Database size and disk usage (including WAL/system files) differ. No credentials or report content are stored by diagnostics.

### Vehicle documents and renewal dates

Apply `supabase/migrations/20261004145726_vehicle_documents.sql` **after the three existing migrations**, once. It adds an owner-scoped `vehicle_documents` table with one current record per vehicle/type (`ruhsat`, `muayene`, `sigorta`, `kasko`). All dates, notes and attachments are optional; inspection/insurance dates support both start and end. Insurance provider/policy number are optional. Dates are validated in both the form and PostgreSQL. Vehicle deletion is restricted and archiving retains documents. Existing financial tables and calculations are unchanged.

**Araçlar → vehicle → Belgeler & Tarihler** lets the administrator edit dates/notes, upload or replace a file, remove its attachment and open it later. Fleet rows retain their compact height and show the most urgent expiration on their secondary line. **Belge Uyarısı** filters active vehicles needing attention; **Yaklaşan Tarihler** lists their approaching/expired dates by urgency. No missing data is presented as valid.

Status is centralized in `src/lib/vehicle-documents.ts`: more than 30 calendar days is green, 1–30 is amber, the expiry date itself and earlier dates are red. Missing end dates and future-start documents are neutral. Calendar differences use Istanbul's current date and UTC date-only arithmetic, avoiding time-of-day/DST rounding errors. The configurable threshold is `DOCUMENT_WARNING_DAYS`.

The migration provisions a separate **private** `vehicle-documents` Storage bucket and owner/vehicle policies. Existing receipt validation/compression is reused: images are resized/compressed locally; stored JPEG/PDF files are limited to 2MiB, input images to 10MB. Viewing uses 60-second signed links. Files have immutable owner/vehicle/type paths. Only unreferenced files can be removed; replacing/removing an attachment never removes historical financial data. A dedicated unexposed `vehicle_document_internal` quota helper limits this bucket to 500 objects/200MiB per owner, independently of receipts. Database and Storage quotas remain separate; this is a bound on uploads, not unlimited capacity. No new environment variables are required, and the bucket must not be made public.

Before the migration is installed, existing screens remain usable and the document section displays a setup message. Test fixtures apply all migrations to isolated PostgreSQL and cover owner isolation, date constraints, private files, replacement/removal, expiry boundaries, priority/filter ordering and compact mobile layouts; no fixture writes to production.
