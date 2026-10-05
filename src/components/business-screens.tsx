"use client";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Plus, Pencil, Search, ChevronRight, Archive } from "lucide-react";
import { useData, errorMessage } from "./data-provider";
import { useSnapshot, useTransactionPage } from "./business-hooks";
import { TransactionList } from "./screens";
import { VehicleDocuments } from "./vehicle-documents";
import { VehicleIllustration } from "./vehicle-illustration";
import {
  documentWarnings,
  documentWarningLabel,
  documentLabels,
} from "@/lib/vehicle-documents";
import { ExcelExport } from "./improvements";
import { EmptyState, MonthPicker, Summary } from "./ui";
import { type EntityModal, type TransactionPrefill } from "./forms";
import {
  type Transaction,
  currentMonth,
  money,
  monthLabel,
  dateRange,
  type DateFilter,
  today,
  payrollLabels,
} from "@/lib/finance";
import {
  vehicleStatus,
  statusLabels,
  employeeStatus,
  percentLabel,
  monthEnd,
  type Status,
  type VehicleSummary,
} from "@/lib/business";
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
export type Actions = {
  add: (prefill?: TransactionPrefill) => void;
  edit: (t: Transaction) => void;
  entity: (modal: EntityModal) => void;
};
function Loading({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="panel form-error">
      {error}{" "}
      <button className="text-button" onClick={() => window.location.reload()}>
        Yeniden dene
      </button>
    </div>
  ) : (
    <div className="compact-loading" aria-label="Yükleniyor">
      {[0, 1, 2, 3].map((i) => (
        <div className="skeleton compact-skeleton" key={i} />
      ))}
    </div>
  );
}
function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-heading compact-heading">
      <h1>{title}</h1>
      {children}
    </div>
  );
}
function Badge({ status, label }: { status: Status; label: string }) {
  return (
    <span className={`status-badge ${status}`}>
      <i />
      {label}
    </span>
  );
}
function Rows({
  page,
  actions,
  title = "Son İşlemler",
}: {
  page: ReturnType<typeof useTransactionPage>;
  actions: Actions;
  title?: string;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="small muted">{page.count} kayıt</span>
      </div>
      {page.error ? (
        <p className="form-error" role="alert">
          {page.error}
          <button className="text-button" onClick={page.reload}>
            Yeniden dene
          </button>
        </p>
      ) : page.loading && !page.rows.length ? (
        <Loading error="" />
      ) : (
        <TransactionList
          transactions={page.rows}
          edit={actions.edit}
          limit={page.rows.length}
        />
      )}
      {page.hasMore && (
        <button
          className="button secondary full"
          disabled={page.loading}
          onClick={page.more}
        >
          {page.loading ? "Yükleniyor…" : "Daha fazla göster"}
        </button>
      )}
    </section>
  );
}
function Change({ current, previous }: { current: number; previous: number }) {
  return (
    <span className="small muted">
      {percentLabel(current, previous)} · geçen aya göre
    </span>
  );
}
export function Dashboard({ actions }: { actions: Actions }) {
  const [month, setMonth] = useState(currentMonth());
  const snapshot = useSnapshot(month),
    page = useTransactionPage({ start: month + "-01", end: monthEnd(month) });
  const v = snapshot.value;
  return (
    <>
      <Heading title={month === currentMonth() ? "Bu Ay" : "Aylık Özet"}>
        <MonthPicker month={month} onChange={setMonth} />
      </Heading>
      {!v ? (
        <Loading error={snapshot.error} />
      ) : (
        <>
          <Summary {...v.total} />
          <div className="balance-strip">
            <span>Güncel Bakiye</span>
            <strong>
              {v.balance === null ? "Başlangıç belirlenmedi" : money(v.balance)}
            </strong>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>Gelir / Gider</h2>
              <span className="small muted">Günlük akış</span>
            </div>
            <CashChart transactions={[]} month={month} daily={v.daily} />
          </section>
        </>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>Son İşlemler</h2>
          <Link href="/islemler" className="text-button">
            Tümü <ChevronRight size={15} />
          </Link>
        </div>
        {page.loading && !page.rows.length ? (
          <Loading error="" />
        ) : page.error ? (
          <p role="alert">{page.error}</p>
        ) : (
          <TransactionList
            transactions={page.rows}
            edit={actions.edit}
            limit={6}
          />
        )}
      </section>
    </>
  );
}
export function Transactions({ actions }: { actions: Actions }) {
  const [filter, setFilter] = useState<DateFilter>("month"),
    [start, setStart] = useState(currentMonth() + "-01"),
    [end, setEnd] = useState(today()),
    [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [vehicle, setVehicle] = useState(""),
    [employee, setEmployee] = useState(""),
    [advanced, setAdvanced] = useState(false);
  const { data } = useData();
  const range = dateRange(filter, start, end);
  const page = useTransactionPage({
    start: range.start,
    end: range.end,
    search,
    type,
    vehicle,
    employee,
  });
  return (
    <>
      <Heading title="İşlemler">
        <button className="button primary" onClick={() => actions.add()}>
          <Plus size={17} /> Ekle
        </button>
      </Heading>
      <div className="filter-tabs compact-tabs">
        {(["today", "week", "month", "custom"] as DateFilter[]).map((f, i) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {["Bugün", "Bu Hafta", "Bu Ay", "Özel Tarih"][i]}
          </button>
        ))}
      </div>
      {filter === "custom" && (
        <div className="date-pair">
          <input
            aria-label="Başlangıç tarihi"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <input
            aria-label="Bitiş tarihi"
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      )}
      <div className="compact-controls">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="İşlem ara"
            placeholder="Kategori veya açıklama ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className="button secondary"
          onClick={() => setAdvanced(!advanced)}
        >
          Filtreler
        </button>
        {(search || type || vehicle || employee || filter !== "month") && (
          <button
            className="text-button"
            onClick={() => {
              setSearch("");
              setType("");
              setVehicle("");
              setEmployee("");
              setFilter("month");
            }}
          >
            Temizle
          </button>
        )}
      </div>
      {advanced && (
        <div className="compact-controls">
          <select
            aria-label="İşlem türü"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Tüm işlemler</option>
            <option value="income">Gelir</option>
            <option value="expense">Gider</option>
            <option value="adjustment">Maaş düzeltmesi</option>
          </select>
          <select
            aria-label="Araç filtresi"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
          >
            <option value="">Tüm araçlar</option>
            {data.vehicles.map((v) => (
              <option value={v.id} key={v.id}>
                {v.plate}
                {v.archived_at ? " · Arşiv" : ""}
              </option>
            ))}
          </select>
          <select
            aria-label="Personel filtresi"
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
          >
            <option value="">Tüm personel</option>
            {data.employees.map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
                {e.archived_at ? " · Arşiv" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {page.error ? null : page.loading && !page.rows.length ? (
        <div
          className="skeleton compact-skeleton"
          aria-label="Özet yükleniyor"
        />
      ) : (
        <Summary {...page.total} />
      )}
      <Rows page={page} actions={actions} title="İşlem Listesi" />
    </>
  );
}
function VehicleDetail({
  id,
  month,
  actions,
}: {
  id: string;
  month: string;
  actions: Actions;
}) {
  const store = useData(),
    s = useSnapshot(month),
    page = useTransactionPage({
      vehicle: id,
      type: "expense",
      start: month + "-01",
      end: monthEnd(month),
    }),
    v = s.value?.vehicles.find((v) => v.id === id);
  if (!s.value) return <Loading error={s.error} />;
  if (!v) return <EmptyState title="Araç bulunamadı" />;
  const status = vehicleStatus(v);
  return (
    <>
      <Link className="back-link" href="/araclar">
        ← Araçlar
      </Link>
      <Heading title={v.plate}>
        <button
          className="button secondary"
          onClick={() => actions.entity({ type: "vehicle", record: v })}
        >
          <Pencil size={16} /> Düzenle
        </button>
      </Heading>
      <p className="detail-subtitle">
        {v.brand} {v.model} {v.archived_at && "· Arşiv"}
      </p>
      <Badge status={status.status} label={statusLabels[status.status]} />
      <div className="detail-numbers">
        <div>
          <span>Bu Ay Gider</span>
          <strong>{money(v.current)}</strong>
        </div>
        <div>
          <span>Geçen Ay</span>
          <strong>{money(v.previous)}</strong>
        </div>
        <div>
          <span>Değişim</span>
          <strong>{percentLabel(v.current, v.previous)}</strong>
        </div>
      </div>
      <div className="detail-foot">
        <span>
          Toplam Gider: <strong>{money(v.lifetime)}</strong>
        </span>
        {!v.archived_at ? (
          <button
            className="button primary"
            onClick={() =>
              actions.add({
                vehicle_id: id,
                date: month === currentMonth() ? today() : month + "-01",
              })
            }
          >
            <Plus size={17} /> Gider Ekle
          </button>
        ) : (
          <button
            className="button secondary"
            disabled={!store.businessReady}
            onClick={() =>
              void store
                .save("vehicles", { archived_at: null }, id)
                .then(() => store.notify("Araç yeniden aktif."))
                .catch((e) => store.notify(errorMessage(e)))
            }
          >
            Yeniden aktif et
          </button>
        )}
      </div>
      <VehicleDocuments vehicleId={id} />
      <p className="small muted status-explanation">
        {status.average === null
          ? "Durum hesabı için son üç ayda en az iki giderli ay gerekir."
          : `Son üç aydaki giderli ayların ortalaması: ${money(Math.round(status.average))}. Tam ay toplamı +%10 üzerindeyse Dikkat, +%35 üzerindeyse Yüksek Gider.`}
      </p>
      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <h2>Gider Eğilimi</h2>
          </div>
          <MonthlyChart
            expenseOnly
            data={[...v.history, { month, amount: v.current }].map((h) => ({
              name: monthLabel(h.month).split(" ")[0],
              Gelir: 0,
              Gider: h.amount,
            }))}
          />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Kategori Dağılımı</h2>
          </div>
          <BreakdownChart
            data={v.categories}
            label="Araç giderleri kategori dağılımı"
          />
        </section>
      </div>
      <Rows page={page} actions={actions} />
    </>
  );
}
export function Vehicles({ actions, id }: { actions: Actions; id?: string }) {
  const [month, setMonth] = useState(currentMonth()),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("highest"),
    [archived, setArchived] = useState(false),
    [documentFilter, setDocumentFilter] = useState(false);
  const { data, documentsReady } = useData();
  const reference = today();
  const warnings = useMemo(
    () => documentWarnings(data.vehicle_documents || [], reference),
    [data.vehicle_documents, reference],
  );
  const warningsByVehicle = useMemo(() => {
    const map = new Map<string, (typeof warnings)[number]>();
    for (const item of warnings)
      if (!map.has(item.document.vehicle_id))
        map.set(item.document.vehicle_id, item);
    return map;
  }, [warnings]);
  const deferred = useDeferredValue(query),
    s = useSnapshot(month);
  const active = useMemo(
    () => s.value?.vehicles.filter((v) => !v.archived_at) || [],
    [s.value],
  );
  const items = useMemo(() => {
    const q = deferred.toLocaleLowerCase("tr-TR").replace(/\s/g, "");
    return (s.value?.vehicles || [])
      .filter(
        (v) =>
          !!v.archived_at === archived &&
          (!q ||
            `${v.plate}${v.brand}${v.model}`
              .toLocaleLowerCase("tr-TR")
              .replace(/\s/g, "")
              .includes(q)) &&
          (filter === "all" || vehicleStatus(v).status === filter) &&
          (!documentFilter || warningsByVehicle.has(v.id)),
      )
      .sort((a, b) =>
        sort === "plate"
          ? a.plate.localeCompare(b.plate, "tr")
          : sort === "newest"
            ? (b.last_activity || "").localeCompare(a.last_activity || "")
            : sort === "lowest"
              ? a.current - b.current
              : b.current - a.current,
      );
  }, [
    s.value,
    deferred,
    filter,
    sort,
    archived,
    documentFilter,
    warningsByVehicle,
  ]);
  const fleet = useMemo(
    () => ({
      current: active.reduce((n, v) => n + v.current, 0),
      previous: active.reduce((n, v) => n + v.previous, 0),
      attention: active.filter((v) =>
        ["attention", "high"].includes(vehicleStatus(v).status),
      ).length,
      largest: active.reduce<VehicleSummary | null>(
        (best, v) => (!best || v.current > best.current ? v : best),
        null,
      ),
    }),
    [active],
  );
  const activeIds = new Set(active.map((v) => v.id));
  const upcoming = warnings.filter((item) =>
    activeIds.has(item.document.vehicle_id),
  );
  const documentCount = new Set(
    upcoming.map((item) => item.document.vehicle_id),
  ).size;
  if (id)
    return (
      <>
        <MonthPicker month={month} onChange={setMonth} />
        <VehicleDetail id={id} month={month} actions={actions} />
      </>
    );
  return (
    <>
      <Heading title="Araçlar">
        <div className="heading-actions">
          <button
            className="icon-button"
            aria-label={archived ? "Aktif araçlar" : "Arşiv"}
            title={archived ? "Aktif araçlar" : "Arşiv"}
            onClick={() => setArchived(!archived)}
          >
            <Archive size={18} />
          </button>
          <button
            className="button secondary"
            onClick={() => actions.entity({ type: "vehicle" })}
          >
            <Plus size={17} /> Araç Ekle
          </button>
        </div>
      </Heading>
      {!s.value ? (
        <Loading error={s.error} />
      ) : (
        <>
          <section className="fleet-summary">
            <div className="fleet-overview-top">
              <MonthPicker month={month} onChange={setMonth} />
              <div>
                <span className="small muted">
                  {month === currentMonth() ? "Bu Ay" : "Aylık Gider"}
                </span>
                <strong>{money(fleet.current)}</strong>
              </div>
            </div>
            <div className="fleet-overview-meta">
              <span>{active.length} Araç</span>
              <span>
                Dikkat Gereken: <strong>{fleet.attention}</strong>
              </span>
              <Change current={fleet.current} previous={fleet.previous} />
              {documentsReady && (
                <button
                  className={`document-attention-filter ${documentFilter ? "active" : ""}`}
                  aria-pressed={documentFilter}
                  onClick={() => setDocumentFilter(!documentFilter)}
                >
                  Belge Uyarısı: <strong>{documentCount}</strong>
                </button>
              )}
            </div>
            <div className="fleet-overview-max">
              En Çok Gider:{" "}
              <strong>
                {fleet.largest?.current
                  ? `${fleet.largest.plate} · ${money(fleet.largest.current)}`
                  : "Henüz gider yok"}
              </strong>
            </div>
          </section>
          <div className="compact-controls">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="Araç ara"
                placeholder="Plaka / marka ara"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Araç sıralaması"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="highest">En yüksek gider</option>
              <option value="lowest">En düşük gider</option>
              <option value="plate">Plaka</option>
              <option value="newest">Son hareket</option>
            </select>
          </div>
          <div className="filter-tabs compact-tabs">
            {[
              ["all", "Tümü"],
              ["normal", "Normal"],
              ["attention", "Dikkat"],
              ["high", "Yüksek Gider"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? "active" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {(query || filter !== "all" || archived || documentFilter) && (
            <p className="small muted filtered-count" role="status">
              {items.length} araç{archived ? " · Arşiv" : ""}
            </p>
          )}
          <div className="compact-list">
            {items.map((v) => {
              const status = vehicleStatus(v);
              const warning = documentsReady
                ? warningsByVehicle.get(v.id)
                : undefined;
              return (
                <Link
                  key={v.id}
                  href={"/araclar/" + v.id}
                  className="fleet-row"
                  title={`Gider: ${statusLabels[status.status]}${warning ? ` · ${documentWarningLabel(warning)}` : ""}`}
                >
                  <div className="fleet-visual" aria-hidden="true">
                    <VehicleIllustration model={v.model} />
                    <i className={`status-dot ${status.status}`} />
                  </div>
                  <div className="entity-name">
                    <strong>{v.plate}</strong>
                    <span>
                      {v.brand} {v.model}
                    </span>
                  </div>
                  <div className="entity-finance">
                    <strong>{money(v.current)}</strong>
                    <span
                      className={
                        warning
                          ? `fleet-document-warning ${warning.status.tone}`
                          : status.status
                      }
                    >
                      {warning
                        ? documentWarningLabel(warning)
                        : statusLabels[status.status]}
                    </span>
                  </div>
                  <ChevronRight size={15} />
                </Link>
              );
            })}
          </div>
          {!items.length && (
            <EmptyState
              title={active.length ? "Araç bulunamadı" : "Henüz araç yok"}
              text="Arama veya filtreyi değiştirin; ilk aracınızı ekleyin."
            />
          )}
          {documentsReady && (
            <details className="vehicle-upcoming">
              <summary>
                Yaklaşan Tarihler <span>{upcoming.length}</span>
              </summary>
              {upcoming.length ? (
                <div className="document-upcoming-list">
                  {upcoming.map((item) => {
                    const vehicle = active.find(
                      (v) => v.id === item.document.vehicle_id,
                    )!;
                    return (
                      <Link
                        className="document-upcoming-row"
                        href={`/araclar/${vehicle.id}`}
                        key={item.document.id}
                      >
                        <div>
                          <strong>{vehicle.plate}</strong>
                          <span>
                            {documentLabels[item.document.type]} ·{" "}
                            {item.document.end_date
                              ?.split("-")
                              .reverse()
                              .join(".")}
                          </span>
                        </div>
                        <span className={`document-state ${item.status.tone}`}>
                          {item.status.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="small muted">
                  Yaklaşan veya süresi dolmuş belge yok.
                </p>
              )}
            </details>
          )}
          <p className="small muted status-explanation">
            Durum, son üç aydaki giderli ayların ortalamasına göre hesaplanır.
            Yeterli geçmiş yoksa nötrdür.
          </p>
        </>
      )}
    </>
  );
}
function EmployeeDetail({
  id,
  month,
  actions,
}: {
  id: string;
  month: string;
  actions: Actions;
}) {
  const store = useData(),
    s = useSnapshot(month),
    page = useTransactionPage({
      employee: id,
      start: month + "-01",
      end: monthEnd(month),
    }),
    e = s.value?.employees.find((e) => e.id === id);
  if (!s.value) return <Loading error={s.error} />;
  if (!e) return <EmptyState title="Personel bulunamadı" />;
  const status = employeeStatus(e, month);
  return (
    <>
      <Link className="back-link" href="/personel">
        ← Personel
      </Link>
      <Heading title={e.name}>
        <button
          className="button secondary"
          onClick={() => actions.entity({ type: "employee", record: e })}
        >
          <Pencil size={16} /> Düzenle
        </button>
      </Heading>
      <Badge
        status={status.status}
        label={e.archived_at ? "Arşiv · " + status.label : status.label}
      />
      <section className="panel payroll-panel">
        <div className="section-heading">
          <h2>Maaş özeti</h2>
          <button
            className="text-button"
            disabled={!!e.archived_at}
            onClick={() =>
              actions.entity({
                type: "period",
                employee: e,
                month,
                record: e.period || undefined,
              })
            }
          >
            {e.period ? "Planı düzenle" : "Plan oluştur"}
          </button>
        </div>
        {!e.period ? (
          <EmptyState
            title="Bu ayın maaş planı yok"
            text="Maaş ve çalışma günlerini belirleyin."
            action={
              !e.archived_at && (
                <button
                  className="button primary"
                  onClick={() =>
                    actions.entity({ type: "period", employee: e, month })
                  }
                >
                  Maaş planı oluştur
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="payroll-balance">
              <span>{e.remaining < 0 ? "Fazla Ödeme" : "Kalan Ödeme"}</span>
              <strong>{money(Math.abs(e.remaining))}</strong>
              <small>{monthLabel(month)}</small>
            </div>
            <div className="payroll-grid">
              {[
                ["Aylık Maaş", money(e.period.salary)],
                ["Çalışma Günleri", e.period.work_days + " gün"],
                ["Hak Ediş", money(e.earned_salary)],
                ["Avans", money(e.advance)],
                ["Maaş Ödemesi", money(e.salary_payment)],
                ["Ödenen Prim", money(e.bonus)],
                ["Prim Alacağı", money(e.bonus_due)],
                ["Kesinti", money(e.deduction)],
                ["Yapılan Ödeme", money(e.paid)],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {!e.archived_at && (
              <div className="payroll-actions">
                {Object.entries(payrollLabels)
                  .filter(([key]) => store.upgradeReady || key !== "bonus_due")
                  .map(([kind, label]) => (
                    <button
                      className="button secondary"
                      key={kind}
                      onClick={() =>
                        actions.add({
                          employee_id: id,
                          payroll_kind:
                            kind as TransactionPrefill["payroll_kind"],
                          date:
                            month === currentMonth() ? today() : month + "-01",
                        })
                      }
                    >
                      <Plus size={15} />
                      {label}
                    </button>
                  ))}
              </div>
            )}
            <p className="form-note">
              Ödenen prim ayrıca hak ediş kabul edilir. Prim alacağı kalan
              tutara eklenir. Personelle ilişkilendirilmiş diğer giderler maaş
              hesabını değiştirmez.
            </p>
          </>
        )}
      </section>
      {e.archived_at && (
        <button
          className="button secondary"
          disabled={!store.businessReady}
          onClick={() =>
            void store
              .save("employees", { archived_at: null }, id)
              .then(() => store.notify("Personel yeniden aktif."))
              .catch((e) => store.notify(errorMessage(e)))
          }
        >
          Yeniden aktif et
        </button>
      )}
      <Rows page={page} actions={actions} title="Personel İşlemleri" />
    </>
  );
}
export function Employees({ actions, id }: { actions: Actions; id?: string }) {
  const [month, setMonth] = useState(currentMonth()),
    [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false);
  const s = useSnapshot(month),
    q = useDeferredValue(query).toLocaleLowerCase("tr-TR");
  const items = useMemo(
    () =>
      (s.value?.employees || [])
        .filter(
          (e) =>
            !!e.archived_at === archived &&
            e.name.toLocaleLowerCase("tr-TR").includes(q),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [s.value, archived, q],
  );
  if (id)
    return (
      <>
        <MonthPicker month={month} onChange={setMonth} />
        <EmployeeDetail id={id} month={month} actions={actions} />
      </>
    );
  return (
    <>
      <Heading title="Personel">
        <button
          className="button secondary"
          onClick={() => actions.entity({ type: "employee" })}
        >
          <Plus size={17} /> Personel Ekle
        </button>
      </Heading>
      <MonthPicker month={month} onChange={setMonth} />
      <label className="search-field">
        <Search size={17} />
        <input
          aria-label="Personel ara"
          placeholder="Ad soyad ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="list-caption">
        <span>
          {items.length} personel{archived ? " · Arşiv" : ""}
        </span>
        <button className="text-button" onClick={() => setArchived(!archived)}>
          {archived ? "Aktif personel" : "Arşiv"}
        </button>
      </div>
      {!s.value ? (
        <Loading error={s.error} />
      ) : (
        <>
          <div className="compact-list">
            {items.map((e) => {
              const status = employeeStatus(e, month);
              return (
                <Link
                  href={"/personel/" + e.id}
                  className="staff-row"
                  key={e.id}
                >
                  <div className="staff-row-top">
                    <strong>{e.name}</strong>
                    <Badge status={status.status} label={status.label} />
                  </div>
                  <div className="staff-figures">
                    {[
                      ["Maaş", e.period?.salary],
                      ["Avans", e.advance],
                      ["Ödenen", e.paid],
                      ["Kalan", e.period ? e.remaining : null],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <span>{label}</span>
                        <strong>
                          {typeof value === "number" ? money(value) : "—"}
                        </strong>
                      </div>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
          {!items.length && (
            <EmptyState
              title="Personel bulunamadı"
              text="İlk personelinizi ekleyin veya aramayı değiştirin."
            />
          )}
        </>
      )}
    </>
  );
}
export function Reports() {
  const [month, setMonth] = useState(currentMonth());
  const s = useSnapshot(month),
    v = s.value;
  return (
    <>
      <Heading title="Raporlar">
        <MonthPicker month={month} onChange={setMonth} />
      </Heading>
      <ExcelExport month={month} />
      {!v ? (
        <Loading error={s.error} />
      ) : (
        <>
          <Summary {...v.total} />
          <section className="panel">
            <div className="section-heading">
              <h2>Aylık Gelir / Gider</h2>
            </div>
            <MonthlyChart
              data={v.trend.map((t) => ({
                name: monthLabel(t.month).split(" ")[0],
                Gelir: t.income,
                Gider: t.expense,
              }))}
            />
          </section>
          <div className="report-answers">
            <div>
              <span>Yakıt Toplamı</span>
              <strong>
                {money(
                  v.categories
                    .filter(
                      (c) => c.name.toLocaleLowerCase("tr-TR") === "yakıt",
                    )
                    .reduce((n, c) => n + c.value, 0),
                )}
              </strong>
            </div>
            <div>
              <span>En Yüksek Kategori</span>
              <strong>{v.categories[0]?.name || "—"}</strong>
              <small>{money(v.categories[0]?.value || 0)}</small>
            </div>
            <div>
              <span>Personel Ödemeleri</span>
              <strong>
                {money(v.employees.reduce((n, e) => n + e.paid, 0))}
              </strong>
            </div>
            <div>
              <span>Personel Avansları</span>
              <strong>
                {money(v.employees.reduce((n, e) => n + e.advance, 0))}
              </strong>
            </div>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>Araç Bazlı Giderler</h2>
              <Change
                current={v.vehicles.reduce((n, e) => n + e.current, 0)}
                previous={v.vehicles.reduce((n, e) => n + e.previous, 0)}
              />
            </div>
            <BreakdownChart
              label="Araçların gider karşılaştırması"
              data={v.vehicles
                .filter((e) => e.current > 0)
                .sort((a, b) => b.current - a.current)
                .map((e) => ({
                  name: e.plate + (e.archived_at ? " · Arşiv" : ""),
                  value: e.current,
                }))}
            />
          </section>
          <div className="two-column">
            <section className="panel">
              <div className="section-heading">
                <h2>Kategori Bazlı Giderler</h2>
              </div>
              <BreakdownChart label="Kategori giderleri" data={v.categories} />
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Personel Bazlı Ödemeler</h2>
              </div>
              {v.employees.some((e) => e.paid || e.advance) ? (
                v.employees
                  .filter((e) => e.paid || e.advance)
                  .sort((a, b) => b.paid - a.paid)
                  .map((e) => (
                    <div className="report-staff-row" key={e.id}>
                      <strong>{e.name}</strong>
                      <span>Ödenen {money(e.paid)}</span>
                      <span>Avans {money(e.advance)}</span>
                    </div>
                  ))
              ) : (
                <EmptyState title="Henüz personel ödemesi yok" />
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
