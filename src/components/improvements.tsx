"use client";
import { useState, type FormEvent } from "react";
import { Download, RotateCcw } from "lucide-react";
import { useData, errorMessage } from "./data-provider";
import { Field, EmptyState } from "./ui";
import {
  currentMonth,
  today,
  inputMoney,
  parseBalance,
  money,
  payrollLabels,
  dateLabel,
} from "@/lib/finance";
export function ExcelExport({ month }: { month: string }) {
  const { data, notify } = useData();
  const [open, setOpen] = useState(false),
    [start, setStart] = useState(`${month}-01`),
    [end, setEnd] = useState(monthEnd(month)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function monthEnd(value: string) {
    const d = new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0);
    return `${value}-${String(d.getDate()).padStart(2, "0")}`;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await (
        await import("@/lib/excel-download")
      ).downloadReport(data, start, end);
      notify("Excel raporu indirildi.");
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="export-section">
      <button
        className="button secondary"
        onClick={() => {
          setStart(`${month}-01`);
          setEnd(monthEnd(month));
          setOpen(!open);
        }}
      >
        <Download size={17} />
        Excel İndir
      </button>
      {open && (
        <form className="panel export-form" onSubmit={submit}>
          <div className="section-heading">
            <h2>Excel raporu</h2>
          </div>
          <p className="form-note">
            Özet, işlemler, araçlar, personel ve kategoriler. Personel maaş
            özeti seçilen aylara ait tam ayları kapsar.
          </p>
          <div className="date-pair">
            <Field label="Rapor başlangıcı">
              <input
                required
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Rapor bitişi">
              <input
                required
                type="date"
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button disabled={busy} className="button primary">
            {busy ? "Hazırlanıyor…" : "Raporu indir"}
          </button>
        </form>
      )}
    </div>
  );
}
export function OpeningBalance() {
  const { data, save, upgradeReady, notify } = useData();
  const settings = data.finance_settings?.[0];
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await save(
        "finance_settings",
        {
          opening_balance: parseBalance(String(form.get("balance"))),
          opening_date: String(form.get("date")),
        },
        settings?.id,
      );
      notify("Başlangıç bakiyesi kaydedildi.");
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Başlangıç Bakiyesi</h2>
        <button
          disabled={!upgradeReady}
          className="text-button"
          onClick={() => setOpen(!open)}
        >
          {settings ? "Düzenle" : "Belirle"}
        </button>
      </div>
      {!upgradeReady ? (
        <p className="form-note">
          Başlangıç bakiyesi, silinen işlemler ve prim alacağı için veritabanı
          güncellemesi gerekli. Diğer işlevleri kullanmaya devam edebilirsiniz.
        </p>
      ) : (
        <>
          <p className="form-note">
            {settings
              ? `${money(settings.opening_balance)} · ${settings.opening_date.split("-").reverse().join(".")}`
              : "Takibe başlamadan önce kasanızda bulunan tutarı girin."}
          </p>
          {open && (
            <form className="form-body" onSubmit={submit}>
              <Field label="Başlangıç tutarı (₺)">
                <input
                  autoFocus
                  name="balance"
                  inputMode="text"
                  required
                  defaultValue={
                    settings ? inputMoney(settings.opening_balance) : "0"
                  }
                />
              </Field>
              <Field label="Bakiye başlangıç tarihi">
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={settings?.opening_date || today()}
                />
              </Field>
              <p className="form-note">
                Tutar, seçilen tarihteki işlemlerden önceki bakiyedir. Bu
                tarihten sonraki gelir ve giderler eklenir. Borç bakiyesi için
                eksi tutar girin.
              </p>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button disabled={busy} className="button primary">
                {busy ? "Kaydediliyor…" : "Bakiyeyi kaydet"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
export function Trash() {
  const { trash, restore, data, notify } = useData();
  const [busy, setBusy] = useState("");
  const [visible, setVisible] = useState(40);
  async function recover(id: string) {
    setBusy(id);
    try {
      await restore(id);
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Silinen İşlemler</h2>
        <span className="small muted">{trash.length} kayıt</span>
      </div>
      {!trash.length ? (
        <EmptyState
          title="Silinen işlem yok"
          text="Sildiğiniz işlemler burada saklanır; istediğiniz zaman geri yükleyebilirsiniz."
        />
      ) : (
        <div>
          {[...trash]
            .sort((a, b) =>
              (b.deleted_at || "").localeCompare(a.deleted_at || ""),
            )
            .slice(0, visible)
            .map((t) => (
              <div key={t.id} className="trash-row">
                <div>
                  <strong>
                    {t.payroll_kind
                      ? payrollLabels[t.payroll_kind]
                      : data.categories.find((c) => c.id === t.category_id)
                          ?.name || "İşlem"}
                  </strong>
                  <span className="small muted">
                    {dateLabel(t.date)} · {money(t.amount)}
                    {t.description ? ` · ${t.description}` : ""}
                  </span>
                </div>
                <button
                  aria-label={`${t.description || t.id} geri yükle`}
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => void recover(t.id)}
                >
                  <RotateCcw size={16} />
                  {busy === t.id ? "Yükleniyor…" : "Geri yükle"}
                </button>
              </div>
            ))}
          {trash.length > visible && (
            <button
              className="button secondary"
              onClick={() => setVisible((n) => n + 40)}
            >
              Daha fazla göster
            </button>
          )}
        </div>
      )}
    </section>
  );
}
export function MoreImprovements() {
  return (
    <>
      <OpeningBalance />
      <ExcelExport month={currentMonth()} />
      <Trash />
    </>
  );
}
