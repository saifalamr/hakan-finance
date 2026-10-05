"use client";
import { useState, useRef, type FormEvent } from "react";
import { Archive, ChevronDown, Trash2 } from "lucide-react";
import {
  type Transaction,
  type Employee,
  type Vehicle,
  type Category,
  type PayrollKind,
  type PayrollPeriod,
  parseMoney,
  inputMoney,
  today,
  payrollLabels,
  monthLabel,
} from "@/lib/finance";
import { useData, errorMessage, type Table } from "./data-provider";
import { Field, Modal } from "./ui";
export type TransactionPrefill = {
  vehicle_id?: string;
  employee_id?: string;
  payroll_kind?: PayrollKind;
  date?: string;
  template?: Transaction;
};
export function TransactionForm({
  transaction,
  prefill,
  onClose,
  onDuplicate,
}: {
  transaction?: Transaction;
  prefill?: TransactionPrefill;
  onDuplicate: (transaction: Transaction) => void;
  onClose: () => void;
}) {
  const {
    data,
    save,
    remove,
    notify,
    upgradeReady,
    businessReady,
    demo,
    userId,
  } = useData();
  const requestId = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const receiptPath = useRef<string | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const source = transaction || prefill?.template;
  const [type, setType] = useState<"income" | "expense">(
    source?.type === "income" ? "income" : "expense",
  );
  const [employee, setEmployee] = useState(
    source?.employee_id || prefill?.employee_id || "",
  );
  const [kind, setKind] = useState<PayrollKind | "">(
    source?.payroll_kind || prefill?.payroll_kind || "",
  );
  const [category, setCategory] = useState(
    source?.category_id ||
      ((source?.employee_id && source?.payroll_kind) ||
      (prefill?.employee_id && prefill?.payroll_kind)
        ? data.categories.find(
            (c) => c.name === "Personel" && c.type === "expense",
          )?.id || ""
        : ""),
  );
  const [advanced, setAdvanced] = useState(
    Boolean(source || prefill?.vehicle_id || prefill?.employee_id),
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const categories = data.categories.filter((c) => c.type === type);
  const payroll = type === "expense" && employee && kind;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const date = String(form.get("date") || today());
      const payrollKind = payroll ? kind : null;
      let knownPlan = data.employee_periods.some(
        (p) =>
          p.employee_id === employee && p.month === `${date.slice(0, 7)}-01`,
      );
      if (payrollKind && !knownPlan && businessReady && !demo) {
        const { supabase } = await import("@/lib/supabase");
        const { data: plans, error: planError } = await supabase!
          .from("employee_periods")
          .select("id")
          .eq("employee_id", employee)
          .eq("month", `${date.slice(0, 7)}-01`);
        if (planError) throw planError;
        knownPlan = !!plans?.length;
      }
      if (
        payrollKind &&
        !knownPlan &&
        !data.employee_periods.some(
          (p) =>
            p.employee_id === employee && p.month === `${date.slice(0, 7)}-01`,
        )
      )
        throw new Error(
          "Önce personel detayından bu ayın maaş planını kaydedin.",
        );
      if (payrollKind === "bonus_due" && !upgradeReady)
        throw new Error(
          "Prim alacağı için veritabanı güncellemesini tamamlayın.",
        );
      const nonCash =
        payrollKind === "deduction" || payrollKind === "bonus_due";
      const categoryId = nonCash ? null : category;
      if (!categoryId && !nonCash)
        throw new Error(
          categories.length
            ? "Kategori seçin."
            : "Önce Daha Fazla → Kategoriler bölümünden bir kategori ekleyin.",
        );
      const amount = parseMoney(String(form.get("amount")));
      let newReceipt =
        type === "expense" && !nonCash
          ? transaction?.receipt_path || null
          : null;
      if (removeReceipt) newReceipt = null;
      if (receipt && type === "expense" && !nonCash) {
        if (demo)
          throw new Error(
            "Belgeler yalnızca gerçek yönetici hesabında yüklenebilir.",
          );
        const { prepareReceipt, uploadReceipt } =
          await import("@/lib/receipts");
        const blob = await prepareReceipt(receipt);
        const path =
          receiptPath.current ||
          `${userId}/${transaction?.id || requestId.current}/${crypto.randomUUID()}.${blob.type === "application/pdf" ? "pdf" : "jpg"}`;
        receiptPath.current = path;
        await uploadReceipt(blob, path);
        newReceipt = path;
      }
      const savedId = await save(
        "transactions",
        {
          type: nonCash ? "adjustment" : type,
          amount,
          category_id: categoryId || null,
          date,
          description: String(form.get("description") || "").trim(),
          vehicle_id: payrollKind
            ? null
            : String(form.get("vehicle") || "") || null,
          employee_id: employee || null,
          payroll_kind: payrollKind || null,
          ...(businessReady && !demo
            ? {
                receipt_path:
                  type === "expense" && !nonCash ? newReceipt : null,
              }
            : {}),
        },
        transaction?.id,
        requestId.current,
      );
      if (!demo && receiptPath.current && newReceipt === receiptPath.current)
        receiptPath.current = null;
      if (
        !demo &&
        transaction?.receipt_path &&
        transaction.receipt_path !== newReceipt
      ) {
        const { supabase } = await import("@/lib/supabase");
        const { error: cleanup } = await supabase!.storage
          .from("finance-receipts")
          .remove([transaction.receipt_path]);
        if (cleanup) notify("Kayıt kaydedildi; eski belge temizlenemedi.");
      }
      void savedId;
      notify(transaction ? "İşlem güncellendi." : "İşlem kaydedildi.");
      onClose();
    } catch (e) {
      // Delete only an unreferenced failed upload. Storage RLS protects an acknowledged or timed-out committed receipt.
      if (!demo && receiptPath.current) {
        const { supabase } = await import("@/lib/supabase");
        const result = await supabase!.storage
          .from("finance-receipts")
          .remove([receiptPath.current]);
        if (!result.error && result.data?.length) receiptPath.current = null;
      }
      setError(errorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function deleteRecord() {
    setBusy(true);
    setError("");
    try {
      await remove("transactions", transaction!.id);
      notify("İşlem silindi.");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={transaction ? "İşlemi düzenle" : "Yeni işlem"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="form-body">
        <div className="segmented">
          <button
            type="button"
            className={type === "expense" ? "selected" : ""}
            onClick={() => {
              setType("expense");
              setCategory("");
            }}
          >
            Gider
          </button>
          <button
            type="button"
            className={type === "income" ? "selected" : ""}
            onClick={() => {
              setType("income");
              setCategory("");
              setKind("");
            }}
          >
            Gelir
          </button>
        </div>
        <Field label="Tutar (₺)">
          <input
            autoFocus
            name="amount"
            inputMode="decimal"
            required
            placeholder="0,00"
            className="amount-input"
            defaultValue={source ? inputMoney(source.amount) : ""}
            maxLength={20}
          />
        </Field>
        {payroll && (kind === "deduction" || kind === "bonus_due") ? (
          <p className="form-note">
            {kind === "bonus_due"
              ? "Prim alacağı kalan ödemeyi artırır; henüz kasa gideri oluşturmaz."
              : "Kesinti maaş bakiyesini azaltır; kasa gideri oluşturmaz."}
          </p>
        ) : (
          <Field label="Kategori">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="" disabled>
                Kategori seçin
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button
          type="button"
          className="details-toggle"
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          Diğer bilgiler{" "}
          <span>
            İsteğe bağlı <ChevronDown size={16} />
          </span>
        </button>
        <div hidden={!advanced} className="optional-fields">
          <Field label="Tarih">
            <input
              name="date"
              type="date"
              required
              defaultValue={transaction?.date || prefill?.date || today()}
            />
          </Field>
          <Field label="Açıklama">
            <input
              name="description"
              defaultValue={source?.description}
              placeholder="Kısa bir not"
              maxLength={300}
            />
          </Field>
          {!payroll && (
            <Field label="Araç">
              <select
                name="vehicle"
                defaultValue={source?.vehicle_id || prefill?.vehicle_id || ""}
              >
                <option value="">Araç seçilmedi</option>
                {data.vehicles
                  .filter((v) => !v.archived_at || v.id === source?.vehicle_id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {v.brand} {v.model}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Personel">
            <select
              value={employee}
              onChange={(e) => {
                setEmployee(e.target.value);
                if (!e.target.value) setKind("");
                else if (type === "expense") {
                  setKind("");
                }
              }}
            >
              <option value="">Personel seçilmedi</option>
              {data.employees
                .filter((e) => !e.archived_at || e.id === source?.employee_id)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
          {employee && type === "expense" && (
            <Field label="Personel işlemi">
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as PayrollKind | "");
                  if (e.target.value)
                    setCategory(
                      data.categories.find(
                        (c) => c.name === "Personel" && c.type === "expense",
                      )?.id || "",
                    );
                }}
              >
                <option value="">Diğer gider (maaşa dahil değil)</option>
                {Object.entries(payrollLabels)
                  .filter(([key]) => upgradeReady || key !== "bonus_due")
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {kind === "bonus" && type === "expense" && (
            <p className="form-note">
              Ödenen prim hem hak edişe hem yapılan ödemeye eklenir. Prim
              alacağı ödendiğinde bu kaydı Ödenen prim olarak değiştirin; yeni
              kayıt eklemeyin.
            </p>
          )}
        </div>
        {type === "expense" &&
          businessReady &&
          advanced &&
          !["deduction", "bonus_due"].includes(kind) && (
            <div className="receipt-field">
              <Field label="Fiş / Fatura (isteğe bağlı)">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={busy}
                  onChange={(e) => {
                    setReceipt(e.target.files?.[0] || null);
                    receiptPath.current = null;
                    setRemoveReceipt(false);
                    setReceiptError("");
                  }}
                />
              </Field>
              <small className="muted">
                JPEG, PNG, WebP veya PDF · En fazla 2 MB · Görseller
                sıkıştırılır
              </small>
              {transaction?.receipt_path && (
                <div className="receipt-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={async () => {
                      const windowRef = window.open("about:blank", "_blank");
                      if (windowRef) windowRef.opener = null;
                      try {
                        const { openReceipt } = await import("@/lib/receipts");
                        const url = await openReceipt(
                          transaction.receipt_path!,
                        );
                        if (windowRef) windowRef.location.href = url;
                        else
                          setReceiptError(
                            "Belgeyi açmak için açılır pencerelere izin verin.",
                          );
                      } catch (e) {
                        windowRef?.close();
                        setReceiptError(errorMessage(e));
                      }
                    }}
                  >
                    Belgeyi aç
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={removeReceipt}
                      onChange={(e) => setRemoveReceipt(e.target.checked)}
                    />{" "}
                    Belgeyi kaldır
                  </label>
                </div>
              )}
              {receiptError && (
                <p role="alert" className="form-error">
                  {receiptError}
                </p>
              )}
            </div>
          )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" type="submit" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        {transaction && (
          <button
            type="button"
            className="button secondary full"
            disabled={busy}
            onClick={() => onDuplicate(transaction)}
          >
            Tekrarla
          </button>
        )}
        {transaction && (
          <div className="delete-zone">
            {confirmDelete ? (
              <>
                <p>
                  İşlem silinenlere taşınsın mı? Daha sonra geri
                  yükleyebilirsiniz.
                </p>
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={deleteRecord}
                >
                  Evet, sil
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setConfirmDelete(false)}
                >
                  Vazgeç
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-button danger-text"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={15} />
                İşlemi sil
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
export type EntityModal =
  | { type: "vehicle"; record?: Vehicle }
  | { type: "employee"; record?: Employee }
  | { type: "category"; record?: Category }
  | {
      type: "period";
      employee: Employee;
      month: string;
      record?: PayrollPeriod;
    };
export function EntityForm({
  modal,
  onClose,
  onVehicleDeleted,
}: {
  modal: EntityModal;
  onClose: () => void;
  onVehicleDeleted?: (id: string) => void;
}) {
  const { save, remove, deleteVehicle, notify, businessReady } = useData();
  const requestId = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false),
    [confirmPermanent, setConfirmPermanent] = useState(false);
  const { type, record } = modal;
  const title =
    type === "vehicle"
      ? "Araç"
      : type === "employee"
        ? "Personel"
        : type === "category"
          ? "Kategori"
          : "Maaş planı";
  const table: Table =
    type === "vehicle"
      ? "vehicles"
      : type === "employee"
        ? "employees"
        : type === "category"
          ? "categories"
          : "employee_periods";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      let values: Record<string, string | number>;
      if (type === "vehicle")
        values = {
          plate: String(form.get("plate")).trim().toLocaleUpperCase("tr-TR"),
          brand: String(form.get("brand")).trim(),
          model: String(form.get("model")).trim(),
        };
      else if (type === "category")
        values = {
          name: String(form.get("name")).trim(),
          type: String(form.get("type")),
        };
      else {
        const salaryInput = String(form.get("salary"));
        const salary = /^0([,.]0{1,2})?$/.test(salaryInput.trim())
          ? 0
          : parseMoney(salaryInput);
        const work_days = Number(form.get("work_days"));
        if (!Number.isInteger(work_days) || work_days < 0 || work_days > 30)
          throw new Error("Çalışma günleri 0–30 arasında olmalı.");
        values =
          type === "period"
            ? {
                salary,
                work_days,
                employee_id: modal.employee.id,
                month: `${modal.month}-01`,
              }
            : { name: String(form.get("name")).trim(), salary, work_days };
      }
      if (
        type === "vehicle" &&
        [values.plate, values.brand, values.model].some(
          (value) => !String(value).trim(),
        )
      )
        throw new Error("Plaka, marka ve model boş bırakılamaz.");
      if ("name" in values && !String(values.name).trim())
        throw new Error("İsim boş bırakılamaz.");
      await save(
        table,
        values,
        type === "period" ? undefined : record?.id,
        requestId.current,
      );
      notify(`${title} kaydedildi.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function deleteRecord(permanent = false) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (permanent && type === "vehicle") await deleteVehicle(record!.id);
      else await remove(table, record!.id);
      notify(
        `${title} ${type === "category" || permanent ? "silindi" : "arşivlendi"}.`,
      );
      onClose();
      if (permanent && type === "vehicle") onVehicleDeleted?.(record!.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const employee =
    modal.type === "employee"
      ? modal.record
      : modal.type === "period"
        ? modal.employee
        : undefined;
  const period = modal.type === "period" ? modal.record : undefined;
  return (
    <Modal
      title={
        type === "period"
          ? `${monthLabel(modal.type === "period" ? modal.month : "")} · Maaş planı`
          : `${title} ${record ? "düzenle" : "ekle"}`
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-body" onSubmit={submit}>
        {type === "vehicle" && (
          <>
            <Field label="Plaka">
              <input
                name="plate"
                required
                maxLength={20}
                autoFocus
                placeholder="34 ABC 123"
                defaultValue={
                  modal.type === "vehicle" ? modal.record?.plate : ""
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="Marka">
                <input
                  name="brand"
                  required
                  maxLength={60}
                  placeholder="Ford"
                  defaultValue={
                    modal.type === "vehicle" ? modal.record?.brand : ""
                  }
                />
              </Field>
              <Field label="Model">
                <input
                  name="model"
                  required
                  maxLength={60}
                  placeholder="Transit"
                  defaultValue={
                    modal.type === "vehicle" ? modal.record?.model : ""
                  }
                />
              </Field>
            </div>
          </>
        )}
        {type === "category" && (
          <>
            <Field label="Kategori adı">
              <input
                name="name"
                required
                autoFocus
                maxLength={50}
                defaultValue={
                  modal.type === "category" ? modal.record?.name : ""
                }
              />
            </Field>
            <Field label="İşlem türü">
              <select
                name="type"
                defaultValue={
                  modal.type === "category" ? modal.record?.type : "expense"
                }
              >
                <option value="expense">Gider</option>
                <option value="income">Gelir</option>
              </select>
            </Field>
          </>
        )}
        {(type === "employee" || type === "period") && (
          <>
            {type === "employee" && (
              <Field label="Ad Soyad">
                <input
                  name="name"
                  required
                  autoFocus
                  maxLength={100}
                  defaultValue={employee?.name}
                />
              </Field>
            )}
            <Field label="Aylık Maaş (₺)">
              <input
                name="salary"
                inputMode="decimal"
                required
                placeholder="32000"
                defaultValue={inputMoney(
                  period?.salary ?? employee?.salary ?? 0,
                )}
              />
            </Field>
            <Field
              label="Çalışma Günleri"
              hint="Hak ediş: aylık maaş ÷ 30 × çalışma günü."
            >
              <input
                name="work_days"
                type="number"
                inputMode="numeric"
                required
                min={0}
                max={30}
                defaultValue={period?.work_days ?? employee?.work_days ?? 30}
              />
            </Field>
            {type === "employee" && record && (
              <p className="form-note">
                Bu bilgiler yeni aylara önerilir. Mevcut ayın maaş planını
                personel detayından düzenleyin.
              </p>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        {record && type === "vehicle" && (
          <div className="delete-zone">
            {confirmPermanent ? (
              <>
                <p>
                  Bu araç kalıcı olarak silinsin mi? İşlem veya belge varsa
                  silinmez. Bu işlem geri alınamaz.
                </p>
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={() => void deleteRecord(true)}
                >
                  {busy ? "Siliniyor…" : "Evet, aracı sil"}
                </button>
                <button
                  type="button"
                  className="button ghost"
                  disabled={busy}
                  onClick={() => setConfirmPermanent(false)}
                >
                  Vazgeç
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-button danger-text"
                disabled={busy}
                onClick={() => {
                  setConfirmPermanent(true);
                  setConfirmDelete(false);
                }}
              >
                <Trash2 size={15} />
                Aracı sil
              </button>
            )}
          </div>
        )}
        {record &&
          type !== "period" &&
          (type === "category" || businessReady) && (
            <div className="delete-zone">
              {confirmDelete ? (
                <>
                  <p>
                    {type === "category"
                      ? "Bu kayıt silinsin mi? Bağlı işlemler varsa silinmez."
                      : "Arşivlensin mi? Geçmiş kayıtlar korunur; yeni işlemler için seçilemez."}
                  </p>
                  <button
                    type="button"
                    className="button danger"
                    disabled={busy}
                    onClick={() => void deleteRecord()}
                  >
                    {type === "category" ? "Evet, sil" : "Evet, arşivle"}
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Vazgeç
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="text-button danger-text"
                  disabled={busy}
                  onClick={() => {
                    setConfirmDelete(true);
                    setConfirmPermanent(false);
                  }}
                >
                  {type === "category" ? (
                    <Trash2 size={15} />
                  ) : (
                    <Archive size={15} />
                  )}
                  {type === "category" ? `${title} sil` : "Arşivle"}
                </button>
              )}
            </div>
          )}
      </form>
    </Modal>
  );
}
