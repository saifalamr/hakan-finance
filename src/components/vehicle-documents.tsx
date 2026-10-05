"use client";
import { useRef, useState, type FormEvent } from "react";
import { FileText, Pencil, ExternalLink } from "lucide-react";
import { useData, errorMessage } from "./data-provider";
import { Field, Modal } from "./ui";
import {
  documentTypes,
  documentLabels,
  documentStatus,
  documentDate,
  validateDocumentDates,
  VEHICLE_DOCUMENT_BUCKET,
  type DocumentType,
  type VehicleDocument,
} from "@/lib/vehicle-documents";
import { supabase } from "@/lib/supabase";

async function removeUnusedFile(path: string): Promise<boolean> {
  try {
    const { data, error } = await supabase!.storage
      .from(VEHICLE_DOCUMENT_BUCKET)
      .remove([path]);
    return !error && !!data?.length;
  } catch {
    return false;
  }
}

function DocumentForm({
  vehicleId,
  type,
  document,
  onClose,
}: {
  vehicleId: string;
  type: DocumentType;
  document?: VehicleDocument;
  onClose: () => void;
}) {
  const { save, userId, demo, notify } = useData();
  const guard = useRef(false),
    request = useRef(crypto.randomUUID()),
    uploaded = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [removeFile, setRemoveFile] = useState(false);
  const [start, setStart] = useState(document?.start_date || ""),
    [end, setEnd] = useState(document?.end_date || "");
  const dated = type !== "ruhsat",
    insured = type === "sigorta" || type === "kasko";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      validateDocumentDates(start, end);
      const text = (name: string) =>
        String(form.get(name) || "").trim() || null;
      let path = removeFile ? null : document?.file_path || null;
      if (file) {
        if (demo)
          throw new Error(
            "Belgeler yalnızca gerçek yönetici hesabında yüklenebilir.",
          );
        const { prepareReceipt, uploadReceipt } =
          await import("@/lib/receipts");
        const blob = await prepareReceipt(file);
        path =
          uploaded.current ||
          `${userId}/${vehicleId}/${type}/${crypto.randomUUID()}.${blob.type === "application/pdf" ? "pdf" : "jpg"}`;
        uploaded.current = path;
        await uploadReceipt(blob, path, VEHICLE_DOCUMENT_BUCKET);
      }
      await save(
        "vehicle_documents",
        {
          vehicle_id: vehicleId,
          type,
          start_date: dated ? start || null : null,
          end_date: dated ? end || null : null,
          provider: insured ? text("provider") : null,
          policy_number: insured ? text("policy") : null,
          notes: text("notes"),
          file_path: path,
        },
        document?.id,
        request.current,
      );
      uploaded.current = null;
      let cleaned = true;
      if (!demo && document?.file_path && document.file_path !== path)
        cleaned = await removeUnusedFile(document.file_path);
      notify(
        cleaned
          ? "Belge bilgileri kaydedildi."
          : "Bilgiler kaydedildi; eski dosya temizlenemedi.",
      );
      onClose();
    } catch (e) {
      // A timed-out successful save is protected by Storage RLS; never delete a referenced object.
      if (
        !demo &&
        uploaded.current &&
        (await removeUnusedFile(uploaded.current))
      )
        uploaded.current = null;
      setError(errorMessage(e));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${documentLabels[type]} düzenle`}
      onClose={() => {
        if (!guard.current) onClose();
      }}
    >
      <form className="form-body vehicle-document-form" onSubmit={submit}>
        {dated && (
          <div className="document-date-fields">
            <Field label="Başlangıç Tarihi">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                min="1000-01-01"
                max="9999-12-31"
              />
            </Field>
            <Field label="Bitiş / Geçerlilik Tarihi">
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                min="1000-01-01"
                max="9999-12-31"
              />
            </Field>
          </div>
        )}
        {insured && (
          <>
            <Field label="Şirket / Sağlayıcı (isteğe bağlı)">
              <input
                name="provider"
                maxLength={120}
                defaultValue={document?.provider || ""}
              />
            </Field>
            <Field label="Poliçe Numarası (isteğe bağlı)">
              <input
                name="policy"
                maxLength={120}
                defaultValue={document?.policy_number || ""}
              />
            </Field>
          </>
        )}
        <Field
          label={
            type === "ruhsat"
              ? "Ruhsat Bilgileri (isteğe bağlı)"
              : "Not (isteğe bağlı)"
          }
        >
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={document?.notes || ""}
          />
        </Field>
        <Field label="Belge / Fotoğraf (isteğe bağlı)">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setRemoveFile(false);
            }}
          />
        </Field>
        <p className="small muted">
          JPEG, PNG, WebP veya PDF. Görseller sıkıştırılır; kaydedilen dosya en
          fazla 2 MB.
        </p>
        {document?.file_path && !file && (
          <label className="document-remove-option">
            <input
              type="checkbox"
              checked={removeFile}
              onChange={(e) => setRemoveFile(e.target.checked)}
            />{" "}
            Mevcut eki kaldır
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>
    </Modal>
  );
}

export function VehicleDocuments({ vehicleId }: { vehicleId: string }) {
  const { data, documentsReady, notify } = useData();
  const [edit, setEdit] = useState<DocumentType | null>(null);
  const [opening, setOpening] = useState("");
  const openingGuard = useRef(false);
  const documents =
    data.vehicle_documents?.filter((d) => d.vehicle_id === vehicleId) || [];
  async function open(document: VehicleDocument) {
    if (!document.file_path || openingGuard.current) return;
    openingGuard.current = true;
    setOpening(document.id);
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      if (!popup)
        throw new Error("Belgeyi açmak için açılır pencerelere izin verin.");
      const { openReceipt } = await import("@/lib/receipts");
      popup.location.href = await openReceipt(
        document.file_path,
        VEHICLE_DOCUMENT_BUCKET,
      );
    } catch (e) {
      popup?.close();
      notify(errorMessage(e));
    } finally {
      openingGuard.current = false;
      setOpening("");
    }
  }
  return (
    <section id="belgeler" className="panel vehicle-document-panel">
      <div className="section-heading">
        <h2>Belgeler & Tarihler</h2>
        <FileText size={18} className="muted" />
      </div>
      {!documentsReady ? (
        <p className="form-note">
          Belge takibi için veritabanı güncellemesi gerekli.
        </p>
      ) : (
        <>
          {documentTypes.map((type) => {
            const document = documents.find((d) => d.type === type),
              status = documentStatus(document);
            return (
              <div
                className="vehicle-document-row"
                key={type}
                data-document-type={type}
              >
                <div className="vehicle-document-info">
                  <strong>{documentLabels[type]}</strong>
                  {type !== "ruhsat" &&
                    (document?.start_date || document?.end_date) && (
                      <span className="document-dates">
                        {documentDate(document.start_date)} →{" "}
                        {documentDate(document.end_date)}
                      </span>
                    )}
                  <span className={`document-state ${status.tone}`}>
                    <i className={`status-dot ${status.tone}`} />
                    {status.label}
                    {status.tone === "normal" && status.days !== null
                      ? ` · ${status.days} gün kaldı`
                      : ""}
                  </span>
                  {document?.provider && (
                    <span className="small muted">
                      {document.provider}
                      {document.policy_number
                        ? ` · ${document.policy_number}`
                        : ""}
                    </span>
                  )}
                  {!document?.provider && document?.policy_number && (
                    <span className="small muted">
                      {document.policy_number}
                    </span>
                  )}
                  {document?.notes && (
                    <p className="document-note">{document.notes}</p>
                  )}
                </div>
                <div className="document-row-actions">
                  {document?.file_path && (
                    <button
                      className="icon-button"
                      disabled={!!opening}
                      aria-label={`${documentLabels[type]} belgesini aç`}
                      onClick={() => void open(document)}
                    >
                      <ExternalLink size={17} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`${documentLabels[type]} düzenle`}
                    onClick={() => setEdit(type)}
                  >
                    <Pencil size={17} />
                  </button>
                </div>
              </div>
            );
          })}
          <p className="small muted document-status-note">
            Son 30 gün yaklaşan, bitiş günü ve sonrası süresi dolmuş olarak
            gösterilir.
          </p>
        </>
      )}
      {edit && (
        <DocumentForm
          key={edit}
          vehicleId={vehicleId}
          type={edit}
          document={documents.find((d) => d.type === edit)}
          onClose={() => setEdit(null)}
        />
      )}
    </section>
  );
}
