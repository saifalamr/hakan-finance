# hakan-finance

A mobile-first, Turkish finance app for one business owner. Next.js App Router, TypeScript, Tailwind CSS, Supabase/PostgreSQL, Lucide and Recharts. The name, icon and quiet green palette are temporary and can be changed independently of functionality.

## Included

- Current-month income, expenses, net balance, daily cash-flow chart and recent transactions.
- Quick income/expense entry, editing, confirmed deletion, date/type/vehicle/employee filters and search.
- Vehicle creation/editing/deletion, monthly/lifetime expenses and category distribution.
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

1. Run `supabase/migrations/20261003153214_finance_mvp.sql` in Supabase SQL Editor (or apply through the Supabase CLI).
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

| Table              | Purpose                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `app_admin`        | One allowed auth user (database singleton constraint).                                                                        |
| `transactions`     | Cash income/expenses and noncash payroll deductions; category, date, vehicle/employee links and optional payroll kind/period. |
| `vehicles`         | Unique plate, brand and model.                                                                                                |
| `employees`        | Name and default monthly salary/days for future plans.                                                                        |
| `employee_periods` | One salary/days snapshot per employee/calendar month.                                                                         |
| `categories`       | Admin's income and expense categories.                                                                                        |

### Payroll rules

- Working days are **0–30**, using a fixed 30-day payroll convention. A full month is 30 days, including a 31-day calendar month. Base entitlement = monthly salary ÷ 30 × working days, rounded to the nearest kuruş. Set 30 for a full salaried month.
- Creating an employee atomically creates the current month's salary plan through a PostgreSQL trigger. For another month, save its plan before recording payroll payments. Each plan can be edited explicitly, changing that month's entitlement. Changing an employee's default salary does not rewrite saved historical plans.
- **Maaş ödemesi** and **Avans** are expense transactions and reduce the selected month's remaining amount.
- **Ek ödeme** means an additional entitlement paid immediately: it increases entitlement and paid cash equally, so it does not change the remaining base salary. It is included in cash expenses and total staff payments.
- **Kesinti** reduces entitlement only; it is stored as `adjustment`, never included in cash expenses/charts/net balance.
- Remaining = prorated base salary + extra earned − deductions − salary payments − advances − extra paid. Negative remaining is shown as **Fazla Ödeme**.
- Other transactions with an employee attached appear in the employee's history but do not reduce salary unless a payroll kind is selected. The form labels these **Diğer gider (maaşa dahil değil)**.
- Payroll month comes from the transaction's date. No automatic carryover or opening cash balance is assumed. **Net Bakiye** is net cash flow for the selected month, not a reconciled bank balance.

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
