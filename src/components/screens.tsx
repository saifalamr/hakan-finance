"use client";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CarFront,
  ChevronRight,
  CircleMinus,
  Download,
  Fuel,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { useData } from "./data-provider";
import { EmptyState, MonthPicker, Summary } from "./ui";
import { type EntityModal, type TransactionPrefill } from "./forms";
import {
  type Transaction,
  currentMonth,
  dateLabel,
  monthLabel,
  money,
  totals,
  inMonth,
  breakdown,
  payrollLabels,
  payrollSummary,
  shiftMonth,
  filterDates,
  today,
  type DateFilter,
} from "@/lib/finance";
const CashChart = dynamic(() => import("./charts").then((m) => m.CashChart), {
  ssr: false,
  loading: () => <div className="chart-frame skeleton" />,
});
const MonthlyChart = dynamic(
  () => import("./charts").then((m) => m.MonthlyChart),
  { ssr: false, loading: () => <div className="chart-frame skeleton" /> },
);
const BreakdownChart = dynamic(
  () => import("./charts").then((m) => m.BreakdownChart),
  { ssr: false },
);
type Actions = {
  add: (prefill?: TransactionPrefill) => void;
  edit: (t: Transaction) => void;
  entity: (modal: EntityModal) => void;
};
export function TransactionList({
  transactions,
  edit,
  limit,
}: {
  transactions: Transaction[];
  edit: Actions["edit"];
  limit?: number;
}) {
  const { data } = useData();
  const list = [...transactions].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at),
  );
  if (!list.length) return <EmptyState />;
  return (
    <div className="transaction-list">
      {list.slice(0, limit ?? list.length).map((t) => {
        const category = data.categories.find((c) => c.id === t.category_id);
        const vehicle = data.vehicles.find((v) => v.id === t.vehicle_id);
        const employee = data.employees.find((e) => e.id === t.employee_id);
        const label = t.payroll_kind
          ? payrollLabels[t.payroll_kind]
          : category?.name || "İşlem";
        const Icon =
          t.type === "income"
            ? ArrowDownLeft
            : t.type === "adjustment"
              ? CircleMinus
              : category?.name === "Yakıt"
                ? Fuel
                : t.vehicle_id
                  ? CarFront
                  : t.employee_id
                    ? UsersRound
                    : ArrowUpRight;
        return (
          <button
            className="transaction-row"
            key={t.id}
            onClick={() => edit(t)}
            aria-label={`${label}, ${money(t.amount)}, düzenle`}
          >
            <span className={`transaction-icon ${t.type}`}>
              <Icon size={19} strokeWidth={1.7} />
            </span>
            <div className="transaction-main">
              <strong>{label}</strong>
              <span>
                {dateLabel(t.date)}
                {vehicle
                  ? ` · ${vehicle.plate}`
                  : employee
                    ? ` · ${employee.name}`
                    : t.description
                      ? ` · ${t.description}`
                      : ""}
              </span>
            </div>
            <div className="transaction-amount">
              <strong
                className={
                  t.type === "income"
                    ? "income"
                    : t.type === "expense"
                      ? "expense"
                      : "muted"
                }
              >
                {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}
                {money(t.amount)}
              </strong>
              <small>
                {t.type === "adjustment"
                  ? "Maaş kesintisi"
                  : category?.name || "Diğer"}
              </small>
            </div>
          </button>
        );
      })}
    </div>
  );
}
export function Dashboard({ actions }: { actions: Actions }) {
  const { data } = useData();
  const month = currentMonth();
  const monthly = inMonth(data.transactions, month);
  const total = totals(monthly);
  const categories = Object.fromEntries(
    data.categories.map((c) => [c.id, c.name]),
  );
  const groups = breakdown(monthly, "category_id", categories).slice(0, 4);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">GENEL BAKIŞ</p>
          <h1>Bu Ay</h1>
          <p className="subtitle">{monthLabel(month)}</p>
        </div>
        <button
          className="button primary desktop-add"
          onClick={() => actions.add()}
        >
          <Plus size={18} /> İşlem Ekle
        </button>
      </div>
      <Summary {...total} />
      <div className="dashboard-grid">
        <section className="panel cash-panel">
          <div className="section-heading">
            <h2>Gelir ve gider</h2>
            <span className="muted small">Günlük akış</span>
          </div>
          <CashChart transactions={monthly} month={month} />
        </section>
        <section className="panel spending-panel">
          <div className="section-heading">
            <h2>Gider dağılımı</h2>
            <Link className="text-link" href="/raporlar">
              Raporlar <ChevronRight size={15} />
            </Link>
          </div>
          {groups.length ? (
            <BreakdownChart
              data={groups}
              label="Bu ay kategori bazlı giderler"
            />
          ) : (
            <EmptyState
              title="Giderleriniz burada"
              text="İlk giderinizi ekleyin, dağılımı takip edin."
            />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Son İşlemler</h2>
          <Link className="text-link" href="/islemler">
            Tümünü gör <ChevronRight size={15} />
          </Link>
        </div>
        {!data.transactions.length ? (
          <EmptyState
            action={
              <button
                className="button secondary"
                onClick={() => actions.add()}
              >
                <Plus size={16} />
                İşlem Ekle
              </button>
            }
          />
        ) : (
          <TransactionList
            transactions={data.transactions}
            edit={actions.edit}
            limit={6}
          />
        )}
      </section>
    </>
  );
}
export function Transactions({ actions }: { actions: Actions }) {
  const { data } = useData();
  const [filter, setFilter] = useState<DateFilter>("month"),
    [start, setStart] = useState(`${currentMonth()}-01`),
    [end, setEnd] = useState(today()),
    [search, setSearch] = useState(""),
    [direction, setDirection] = useState("all"),
    [vehicle, setVehicle] = useState(""),
    [employee, setEmployee] = useState(""),
    [showFilters, setShowFilters] = useState(false),
    [limit, setLimit] = useState(40);
  const filtered = filterDates(data.transactions, filter, start, end).filter(
    (t) =>
      (direction === "all" || t.type === direction) &&
      (!vehicle || t.vehicle_id === vehicle) &&
      (!employee || t.employee_id === employee) &&
      `${t.description} ${data.categories.find((c) => c.id === t.category_id)?.name || ""} ${t.payroll_kind ? payrollLabels[t.payroll_kind] : ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(search.toLocaleLowerCase("tr-TR")),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KAYITLAR</p>
          <h1>İşlemler</h1>
          <p className="subtitle">Tüm gelir ve giderleriniz.</p>
        </div>
        <button
          className="button primary desktop-add"
          onClick={() => actions.add()}
        >
          <Plus size={18} /> İşlem Ekle
        </button>
      </div>
      <div className="filter-bar">
        {(
          [
            ["today", "Bugün"],
            ["week", "Bu Hafta"],
            ["month", "Bu Ay"],
            ["custom", "Özel Tarih"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "filter active" : "filter"}
            onClick={() => {
              setFilter(key);
              setLimit(40);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {filter === "custom" && (
        <div className="date-range">
          <label>
            Başlangıç
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Bitiş
            <input
              type="date"
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
      )}
      {filter === "custom" && end < start && (
        <p className="form-error" role="alert">
          Bitiş tarihi başlangıçtan önce olamaz.
        </p>
      )}
      <Summary {...totals(filtered)} />
      <section className="panel">
        <div className="search-bar">
          <label className="search-input">
            <Search size={18} />
            <input
              aria-label="İşlem ara"
              placeholder="İşlem ara"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(40);
              }}
            />
          </label>
          <button
            className="icon-button"
            aria-label="Filtreler"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal size={19} />
          </button>
        </div>
        {showFilters && (
          <div className="extra-filters">
            <label>
              İşlem türü
              <select
                aria-label="İşlem türü"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="all">Tüm işlemler</option>
                <option value="income">Gelir</option>
                <option value="expense">Gider</option>
                <option value="adjustment">Kesinti</option>
              </select>
            </label>
            <label>
              Araç
              <select
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
              >
                <option value="">Tüm araçlar</option>
                {data.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Personel
              <select
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
              >
                <option value="">Tüm personel</option>
                {data.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="section-heading list-heading">
          <h2>{filtered.length} işlem</h2>
          {(vehicle || employee || direction !== "all" || search) && (
            <button
              className="text-button"
              onClick={() => {
                setVehicle("");
                setEmployee("");
                setDirection("all");
                setSearch("");
              }}
            >
              <X size={14} />
              Temizle
            </button>
          )}
        </div>
        <TransactionList
          transactions={filtered}
          edit={actions.edit}
          limit={limit}
        />
        {filtered.length > limit && (
          <button
            className="button ghost full"
            onClick={() => setLimit(limit + 40)}
          >
            Daha fazla göster
          </button>
        )}
      </section>
    </>
  );
}
export function Vehicles({ actions, id }: { actions: Actions; id?: string }) {
  const { data } = useData();
  const [month, setMonth] = useState(currentMonth());
  const vehicle = data.vehicles.find((v) => v.id === id);
  if (id && !vehicle)
    return (
      <EmptyState
        title="Araç bulunamadı"
        action={
          <Link href="/araclar" className="button secondary">
            Araçlara dön
          </Link>
        }
      />
    );
  if (vehicle) {
    const all = data.transactions.filter(
      (t) => t.vehicle_id === vehicle.id && t.type === "expense",
    );
    const monthly = inMonth(all, month);
    return (
      <>
        <Link className="back-link" href="/araclar">
          ← Araçlar
        </Link>
        <div className="page-heading">
          <div>
            <p className="eyebrow">ARAÇ DETAYI</p>
            <h1>{vehicle.plate}</h1>
            <p className="subtitle">
              {vehicle.brand} {vehicle.model}
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => actions.entity({ type: "vehicle", record: vehicle })}
          >
            <Pencil size={16} />
            <span>Düzenle</span>
          </button>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
        <div className="two-metrics">
          <div className="metric">
            <span className="metric-label">Toplam Gider</span>
            <strong>{money(totals(all).expense)}</strong>
          </div>
          <div className="metric">
            <span className="metric-label">
              {month === currentMonth() ? "Bu Ayki Gider" : "Seçili Ay Gideri"}
            </span>
            <strong className="expense">
              {money(totals(monthly).expense)}
            </strong>
          </div>
        </div>
        <section className="panel">
          <div className="section-heading">
            <h2>Gider dağılımı</h2>
            <span className="small muted">{monthLabel(month)}</span>
          </div>
          <BreakdownChart
            data={breakdown(
              monthly,
              "category_id",
              Object.fromEntries(data.categories.map((c) => [c.id, c.name])),
            )}
            label="Araç gider dağılımı"
          />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Son giderler</h2>
            <button
              className="text-button"
              onClick={() => actions.add({ vehicle_id: vehicle.id })}
            >
              <Plus size={16} />
              Gider Ekle
            </button>
          </div>
          <TransactionList transactions={monthly} edit={actions.edit} />
        </section>
      </>
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MASRAF TAKİBİ</p>
          <h1>Araçlar</h1>
          <p className="subtitle">Her aracın gideri, tek bakışta.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => actions.entity({ type: "vehicle" })}
        >
          <Plus size={17} />
          Araç Ekle
        </button>
      </div>
      {!data.vehicles.length ? (
        <section className="panel">
          <EmptyState
            title="İlk aracınızı ekleyin"
            text="Yakıt, bakım ve diğer masrafları plaka bazında takip edin."
            action={
              <button
                className="button primary"
                onClick={() => actions.entity({ type: "vehicle" })}
              >
                <Plus size={16} />
                Araç Ekle
              </button>
            }
          />
        </section>
      ) : (
        <div className="entity-grid">
          {data.vehicles.map((v) => {
            const all = data.transactions.filter((t) => t.vehicle_id === v.id);
            return (
              <Link
                key={v.id}
                className="entity-card"
                href={`/araclar/${v.id}`}
              >
                <div className="entity-card-heading">
                  <span className="entity-icon">
                    <CarFront size={23} strokeWidth={1.6} />
                  </span>
                  <ChevronRight size={18} className="muted" />
                </div>
                <h2 className="plate">{v.plate}</h2>
                <p>
                  {v.brand} {v.model}
                </p>
                <div className="card-values">
                  <div>
                    <span>Bu Ayki Gider</span>
                    <strong>
                      {money(totals(inMonth(all, currentMonth())).expense)}
                    </strong>
                  </div>
                  <div>
                    <span>Toplam Gider</span>
                    <strong>{money(totals(all).expense)}</strong>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
export function Employees({ actions, id }: { actions: Actions; id?: string }) {
  const { data } = useData();
  const [month, setMonth] = useState(currentMonth());
  const employee = data.employees.find((e) => e.id === id);
  const employeeSummary = (employeeId: string) => {
    const period = data.employee_periods.find(
      (p) => p.employee_id === employeeId && p.month === `${month}-01`,
    );
    return {
      period,
      ...payrollSummary(
        period,
        inMonth(
          data.transactions.filter((t) => t.employee_id === employeeId),
          month,
        ),
      ),
    };
  };
  if (id && !employee)
    return (
      <EmptyState
        title="Personel bulunamadı"
        action={
          <Link href="/personel" className="button secondary">
            Personele dön
          </Link>
        }
      />
    );
  if (employee) {
    const summary = employeeSummary(employee.id),
      transactions = inMonth(
        data.transactions.filter((t) => t.employee_id === employee.id),
        month,
      );
    return (
      <>
        <Link className="back-link" href="/personel">
          ← Personel
        </Link>
        <div className="page-heading">
          <div>
            <p className="eyebrow">PERSONEL DETAYI</p>
            <h1>{employee.name}</h1>
            <p className="subtitle">Maaş ve ödeme takibi</p>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              actions.entity({ type: "employee", record: employee })
            }
          >
            <Pencil size={16} />
            <span>Düzenle</span>
          </button>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
        <section className="panel payroll-panel">
          <div className="section-heading">
            <h2>Maaş özeti</h2>
            <button
              className="text-button"
              onClick={() =>
                actions.entity({
                  type: "period",
                  employee,
                  month,
                  record: summary.period,
                })
              }
            >
              <Pencil size={15} />
              {summary.period ? "Planı düzenle" : "Plan oluştur"}
            </button>
          </div>
          {!summary.period ? (
            <EmptyState
              title="Bu ayın maaş planı yok"
              text="Ödeme kaydetmeden önce aylık maaş ve çalışma günlerini belirleyin."
              action={
                <button
                  className="button primary"
                  onClick={() =>
                    actions.entity({ type: "period", employee, month })
                  }
                >
                  Maaş planı oluştur
                </button>
              }
            />
          ) : (
            <>
              <div className="payroll-balance">
                <span>
                  {summary.remaining < 0 ? "Fazla Ödeme" : "Kalan Ödeme"}
                </span>
                <strong>{money(Math.abs(summary.remaining))}</strong>
                <small>{monthLabel(month)}</small>
              </div>
              <div className="payroll-grid">
                <div>
                  <span>Aylık Maaş</span>
                  <strong>{money(summary.period.salary)}</strong>
                </div>
                <div>
                  <span>Çalışma Günleri</span>
                  <strong>{summary.period.work_days} gün</strong>
                </div>
                <div>
                  <span>Hak Ediş</span>
                  <strong>{money(summary.salary)}</strong>
                </div>
                <div>
                  <span>Avans</span>
                  <strong>{money(summary.advance)}</strong>
                </div>
                <div>
                  <span>Maaş Ödemesi</span>
                  <strong>{money(summary.salaryPayment)}</strong>
                </div>
                <div>
                  <span>Ek Ödeme</span>
                  <strong>{money(summary.bonus)}</strong>
                </div>
                <div>
                  <span>Kesinti</span>
                  <strong>{money(summary.deduction)}</strong>
                </div>
                <div>
                  <span>Yapılan Ödeme</span>
                  <strong>{money(summary.paid)}</strong>
                </div>
              </div>
              <div className="payroll-actions">
                {Object.entries(payrollLabels).map(([kind, label]) => (
                  <button
                    className="button secondary"
                    key={kind}
                    onClick={() =>
                      actions.add({
                        employee_id: employee.id,
                        payroll_kind:
                          kind as TransactionPrefill["payroll_kind"],
                        date:
                          month === currentMonth() ? today() : `${month}-01`,
                      })
                    }
                  >
                    <Plus size={15} />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>İşlem geçmişi</h2>
            <span className="small muted">{transactions.length} kayıt</span>
          </div>
          <TransactionList transactions={transactions} edit={actions.edit} />
        </section>
      </>
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ÖDEME TAKİBİ</p>
          <h1>Personel</h1>
          <p className="subtitle">Maaşlar, avanslar ve kalan ödemeler.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => actions.entity({ type: "employee" })}
        >
          <Plus size={17} />
          Personel Ekle
        </button>
      </div>
      <MonthPicker month={month} onChange={setMonth} />
      {!data.employees.length ? (
        <section className="panel">
          <EmptyState
            title="İlk personeli ekleyin"
            text="Maaş ve avansları düzenli olarak takip edin."
            action={
              <button
                className="button primary"
                onClick={() => actions.entity({ type: "employee" })}
              >
                <Plus size={16} />
                Personel Ekle
              </button>
            }
          />
        </section>
      ) : (
        <div className="entity-grid">
          {data.employees.map((e) => {
            const summary = employeeSummary(e.id);
            return (
              <Link
                key={e.id}
                className="entity-card"
                href={`/personel/${e.id}`}
              >
                <div className="employee-card-heading">
                  <span className="avatar">
                    {e.name
                      .split(" ")
                      .slice(0, 2)
                      .map((n) => n.charAt(0))
                      .join("")}
                  </span>
                  <div>
                    <h2>{e.name}</h2>
                    <p>
                      {summary.period
                        ? `${summary.period.work_days} çalışma günü`
                        : "Maaş planı yok"}
                    </p>
                  </div>
                  <ChevronRight size={18} className="muted" />
                </div>
                <div className="employee-values">
                  <div>
                    <span>Maaş</span>
                    <strong>{money(summary.period?.salary || 0)}</strong>
                  </div>
                  <div>
                    <span>Avans</span>
                    <strong>{money(summary.advance)}</strong>
                  </div>
                  <div>
                    <span>Yapılan Ödeme</span>
                    <strong>{money(summary.paid)}</strong>
                  </div>
                  <div className="remaining-value">
                    <span>
                      {summary.remaining < 0 ? "Fazla Ödeme" : "Kalan Ödeme"}
                    </span>
                    <strong>{money(Math.abs(summary.remaining))}</strong>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
export function Reports() {
  const { data } = useData();
  const [month, setMonth] = useState(currentMonth());
  const monthly = inMonth(data.transactions, month);
  const months = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(month, i - 5);
    const values = totals(inMonth(data.transactions, m));
    return {
      name: new Date(m + "-01T12:00:00").toLocaleDateString("tr-TR", {
        month: "short",
      }),
      Gelir: values.income,
      Gider: values.expense,
    };
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FİNANSAL GÖRÜNÜM</p>
          <h1>Raporlar</h1>
          <p className="subtitle">Nereye, ne kadar harcadınız?</p>
        </div>
      </div>
      <MonthPicker month={month} onChange={setMonth} />
      <Summary {...totals(monthly)} />
      <section className="panel">
        <div className="section-heading">
          <h2>Aylık Gelir / Gider</h2>
          <span className="small muted">Son 6 ay</span>
        </div>
        <MonthlyChart data={months} />
      </section>
      <div className="report-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Kategori Bazlı Giderler</h2>
          </div>
          <BreakdownChart
            data={breakdown(
              monthly,
              "category_id",
              Object.fromEntries(data.categories.map((c) => [c.id, c.name])),
            )}
            label="Kategori giderleri"
          />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Araç Bazlı Giderler</h2>
          </div>
          <BreakdownChart
            data={breakdown(
              monthly.filter((t) => t.vehicle_id),
              "vehicle_id",
              Object.fromEntries(data.vehicles.map((v) => [v.id, v.plate])),
            )}
            label="Araç giderleri"
          />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Personel Bazlı Ödemeler</h2>
          </div>
          <BreakdownChart
            data={breakdown(
              monthly.filter(
                (t) => t.employee_id && t.payroll_kind && t.type === "expense",
              ),
              "employee_id",
              Object.fromEntries(data.employees.map((e) => [e.id, e.name])),
            )}
            label="Personel ödemeleri"
          />
        </section>
      </div>
    </>
  );
}
export function More({ actions }: { actions: Actions }) {
  const { data, demo, notify } = useData();
  function resetDemo() {
    localStorage.removeItem("finance-development-demo-v1");
    window.location.reload();
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">AYARLAR VE RAPORLAR</p>
          <h1>Daha Fazla</h1>
        </div>
      </div>
      <section className="panel">
        <Link href="/raporlar" className="menu-row">
          <span className="entity-icon">
            <Wallet size={20} />
          </span>
          <div>
            <strong>Raporlar</strong>
            <p>Aylık özet ve gider dağılımı</p>
          </div>
          <ChevronRight size={18} />
        </Link>
        <div className="menu-row">
          <span className="entity-icon">
            <Download size={20} />
          </span>
          <div>
            <strong>Ana ekrana ekle</strong>
            <p>
              iPhone: Paylaş → Ana Ekrana Ekle
              <br />
              Android: Tarayıcı menüsü → Uygulamayı yükle
            </p>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Kategoriler</h2>
          <button
            className="text-button"
            onClick={() => actions.entity({ type: "category" })}
          >
            <Plus size={17} />
            Ekle
          </button>
        </div>
        {!data.categories.length ? (
          <EmptyState
            title="Kategori ekleyin"
            text="Gelir ve giderlerinizi kolayca sınıflandırın."
          />
        ) : (
          <div className="category-list">
            {[...data.categories]
              .sort(
                (a, b) =>
                  a.type.localeCompare(b.type) ||
                  a.name.localeCompare(b.name, "tr"),
              )
              .map((c) => (
                <button
                  className="category-row"
                  key={c.id}
                  onClick={() =>
                    actions.entity({ type: "category", record: c })
                  }
                >
                  <span>{c.name}</span>
                  <span
                    className={`category-type ${c.type === "income" ? "income" : "muted"}`}
                  >
                    {c.type === "income" ? "Gelir" : "Gider"}
                    <Pencil size={14} />
                  </span>
                </button>
              ))}
          </div>
        )}
      </section>
      {demo && (
        <section className="panel">
          <div className="section-heading">
            <h2>Geliştirme demosu</h2>
          </div>
          <p className="form-note">
            Demo kayıtları yalnızca bu tarayıcıda tutulur.
          </p>
          <button
            className="button secondary"
            onClick={() => {
              resetDemo();
              notify("Demo temizlendi.");
            }}
          >
            Demo verilerini temizle
          </button>
        </section>
      )}
    </>
  );
}
