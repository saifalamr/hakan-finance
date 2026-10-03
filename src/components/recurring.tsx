"use client";
import { useState, useRef, type FormEvent } from "react";
import { Plus, Pencil } from "lucide-react";
import { useData, errorMessage } from "./data-provider";
import { supabase } from "@/lib/supabase";
import {
  type RecurringExpense,
  parseMoney,
  money,
  inputMoney,
  today,
} from "@/lib/finance";
import { nextRecurringDate } from "@/lib/business";
import { Modal, Field, EmptyState } from "./ui";
const frequencies = { weekly: "Haftalık", monthly: "Aylık", yearly: "Yıllık" };
export function RecurringExpenses() {
  const { data, save, refresh, demo, businessReady, notify } = useData();
  const [edit, setEdit] = useState<RecurringExpense | null | undefined>(
      undefined,
    ),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<RecurringExpense | null>(null);
  const guard = useRef(false),
    request = useRef(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy("save");
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const date = String(form.get("date"));
      if (!String(form.get("category")))
        throw new Error("Önce bir gider kategorisi ekleyin.");
      if (form.get("kind") && (!form.get("employee") || form.get("vehicle")))
        throw new Error(
          "Maaş işlemi için personel seçin ve araç bağlantısını kaldırın.",
        );
      await save(
        "recurring_expenses",
        {
          name: String(form.get("name")).trim(),
          amount: parseMoney(String(form.get("amount"))),
          category_id: String(form.get("category")),
          frequency: String(form.get("frequency")),
          next_date: date,
          anchor_day:
            edit && date === edit.next_date
              ? edit.anchor_day
              : Number(date.slice(8)),
          anchor_month:
            edit && date === edit.next_date
              ? edit.anchor_month
              : Number(date.slice(5, 7)),
          vehicle_id: String(form.get("vehicle")) || null,
          employee_id: String(form.get("employee")) || null,
          payroll_kind: String(form.get("kind")) || null,
        },
        edit?.id,
        request.current,
      );
      setEdit(undefined);
      notify("Tekrarlayan gider kaydedildi.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      guard.current = false;
      setBusy("");
    }
  }
  async function post(r: RecurringExpense) {
    if (guard.current) return;
    guard.current = true;
    setBusy(r.id);
    setError("");
    try {
      if (demo) {
        if (
          r.payroll_kind &&
          !data.employee_periods.some(
            (p) =>
              p.employee_id === r.employee_id &&
              p.month === r.next_date.slice(0, 7) + "-01",
          )
        )
          throw new Error("Önce bu ayın maaş planını kaydedin.");
        const id = await save("transactions", {
          type: "expense",
          amount: r.amount,
          category_id: r.category_id,
          date: r.next_date,
          description: r.name,
          vehicle_id: r.vehicle_id,
          employee_id: r.employee_id,
          payroll_kind: r.payroll_kind,
          recurring_id: r.id,
          recurring_date: r.next_date,
        });
        void id;
        await save(
          "recurring_expenses",
          {
            next_date: nextRecurringDate(
              r.next_date,
              r.frequency,
              r.anchor_day,
              r.anchor_month,
            ),
          },
          r.id,
        );
      } else {
        const { error } = await supabase!.rpc("post_recurring", {
          p_id: r.id,
          p_due: r.next_date,
        });
        if (error) throw error;
        await refresh();
      }
      setConfirm(null);
      notify("Gider kaydedildi; sonraki tarih güncellendi.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      guard.current = false;
      setBusy("");
    }
  }
  const records = (data.recurring_expenses || [])
    .filter((r) => !r.archived_at)
    .sort((a, b) => a.next_date.localeCompare(b.next_date));
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Tekrarlayan Giderler</h2>
        <button
          className="text-button"
          aria-label="Tekrarlayan Gider Ekle"
          disabled={!businessReady}
          onClick={() => {
            request.current = crypto.randomUUID();
            setEdit(null);
            setError("");
          }}
        >
          <Plus size={16} /> Ekle
        </button>
      </div>
      <p className="small muted">
        Tarihi geldiğinde onaylayarak kaydedin. Otomatik ödeme yapılmaz.
      </p>
      {!businessReady ? (
        <p className="form-note">
          Bu özellik için veritabanı güncellemesi gerekli.
        </p>
      ) : !records.length ? (
        <EmptyState
          title="Tekrarlayan gider yok"
          text="Kira, sigorta veya düzenli ödemeleri ekleyin."
        />
      ) : (
        records.map((r) => (
          <div className="recurring-row" key={r.id}>
            <div>
              <strong>{r.name}</strong>
              <span className="small muted">
                {r.next_date.split("-").reverse().join(".")} ·{" "}
                {frequencies[r.frequency]} · {money(r.amount)}
              </span>
            </div>
            <button
              aria-label={`${r.name} düzenle`}
              className="icon-button"
              onClick={() => {
                setEdit(r);
                setError("");
              }}
            >
              <Pencil size={16} />
            </button>
            <button
              className="button secondary"
              disabled={!!busy || r.next_date > today()}
              onClick={() => {
                setConfirm(r);
                setError("");
              }}
            >
              Kaydet
            </button>
          </div>
        ))
      )}
      {edit !== undefined && (
        <Modal
          title={edit ? "Tekrarlayan gider düzenle" : "Tekrarlayan gider ekle"}
          onClose={() => {
            if (!busy) setEdit(undefined);
          }}
        >
          <form className="form-body" onSubmit={submit}>
            <Field label="Gider adı">
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={edit?.name}
                placeholder="Kira"
              />
            </Field>
            <Field label="Tutar (₺)">
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={edit ? inputMoney(edit.amount) : ""}
              />
            </Field>
            <Field label="Kategori">
              <select
                required
                name="category"
                defaultValue={edit?.category_id || ""}
              >
                <option value="" disabled>
                  Kategori seçin
                </option>
                {data.categories
                  .filter((c) => c.type === "expense")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Sıklık">
              <select
                name="frequency"
                defaultValue={edit?.frequency || "monthly"}
              >
                {Object.entries(frequencies).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sonraki tarih">
              <input
                name="date"
                type="date"
                required
                defaultValue={edit?.next_date || today()}
              />
            </Field>
            <Field label="Araç">
              <select name="vehicle" defaultValue={edit?.vehicle_id || ""}>
                <option value="">Araç seçilmedi</option>
                {data.vehicles
                  .filter((v) => !v.archived_at || v.id === edit?.vehicle_id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Personel">
              <select name="employee" defaultValue={edit?.employee_id || ""}>
                <option value="">Personel seçilmedi</option>
                {data.employees
                  .filter((e) => !e.archived_at || e.id === edit?.employee_id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Personel işlemi">
              <select name="kind" defaultValue={edit?.payroll_kind || ""}>
                <option value="">Diğer gider</option>
                <option value="salary_payment">Maaş ödemesi</option>
                <option value="advance">Avans</option>
                <option value="bonus">Ödenen prim</option>
              </select>
            </Field>
            <p className="form-note">
              Maaş ödemeleri için ilgili ayın maaş planı gerekir. Aynı gider iki
              kez kaydedilmez.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={!!busy}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
            {edit && (
              <button
                type="button"
                className="button secondary"
                disabled={!!busy}
                onClick={async () => {
                  try {
                    await save(
                      "recurring_expenses",
                      { archived_at: new Date().toISOString() },
                      edit.id,
                    );
                    setEdit(undefined);
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                Tekrarı durdur
              </button>
            )}
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title="Gideri onayla"
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <div className="form-body">
            <p>
              {confirm.name} · {money(confirm.amount)} ·{" "}
              {confirm.next_date.split("-").reverse().join(".")}
            </p>
            <p className="small muted">
              Gider kaydedilir. Sonraki tarih ilerletilir. Ödemeyi yaptıysanız
              onaylayın.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => void post(confirm)}
            >
              {busy ? "Kaydediliyor…" : "Gideri kaydet"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
