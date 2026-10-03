"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
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
  UsersRound,
  Wallet,
} from "lucide-react";
import { RecurringExpenses } from "./recurring";
import { MoreImprovements } from "./improvements";
import { useData } from "./data-provider";
import { EmptyState } from "./ui";
import { type EntityModal, type TransactionPrefill } from "./forms";
import {
  type Transaction,
  dateLabel,
  money,
  payrollLabels,
} from "@/lib/finance";
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
  const [visible, setVisible] = useState(40);
  const list = useMemo(
    () =>
      [...transactions].sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.created_at.localeCompare(a.created_at),
      ),
    [transactions],
  );
  const names = useMemo(
    () => ({
      categories: new Map(data.categories.map((row) => [row.id, row])),
      vehicles: new Map(data.vehicles.map((row) => [row.id, row])),
      employees: new Map(data.employees.map((row) => [row.id, row])),
    }),
    [data.categories, data.vehicles, data.employees],
  );
  if (!list.length) return <EmptyState />;
  return (
    <div className="transaction-list">
      {list.slice(0, limit ?? visible).map((t) => {
        const category = names.categories.get(t.category_id || "");
        const vehicle = names.vehicles.get(t.vehicle_id || "");
        const employee = names.employees.get(t.employee_id || "");
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
                {vehicle ? ` · ${vehicle.plate}` : ""}
                {employee ? ` · ${employee.name}` : ""}
                {t.description ? ` · ${t.description}` : ""}
                {t.receipt_path ? " · Fiş" : ""}
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
                  ? t.payroll_kind === "bonus_due"
                    ? "Henüz ödenmedi"
                    : "Maaş kesintisi"
                  : category?.name || "Diğer"}
              </small>
            </div>
          </button>
        );
      })}
      {!limit && list.length > visible && (
        <button
          className="button secondary"
          onClick={() => setVisible((n) => n + 40)}
        >
          Daha fazla göster
        </button>
      )}
    </div>
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
      <RecurringExpenses />
      <MoreImprovements />
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
