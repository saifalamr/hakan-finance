"use client";
import {
  useEffect,
  useRef,
  useId,
  useSyncExternalStore,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  X,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { money, monthLabel, shiftMonth } from "@/lib/finance";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog
      .querySelector<HTMLInputElement>("[data-initial-focus]")
      ?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const resize = () =>
      dialog.style.setProperty(
        "--dialog-viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    resize();
    viewport?.addEventListener("resize", resize);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      viewport?.removeEventListener("resize", resize);
      document.body.style.overflow = old;
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = ref.current!.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Kapat"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function EmptyState({
  title = "Henüz işlem yok",
  text = "İlk kaydınızı ekleyerek başlayın.",
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={24} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="month-picker">
      <button
        className="icon-button"
        aria-label="Önceki ay"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft size={18} />
      </button>
      <span>{monthLabel(month)}</span>
      <button
        className="icon-button"
        aria-label="Sonraki ay"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
export function Summary({
  income,
  expense,
  net,
}: {
  income: number;
  expense: number;
  net: number;
}) {
  return (
    <div className="summary-grid">
      <div className="metric income-metric">
        <div className="metric-label">
          <span>Toplam Gelir</span>
          <ArrowDownLeft size={18} />
        </div>
        <strong className="income">{money(income)}</strong>
      </div>
      <div className="metric">
        <div className="metric-label">
          <span>Toplam Gider</span>
          <ArrowUpRight size={18} />
        </div>
        <strong className="expense">{money(expense)}</strong>
      </div>
      <div className="metric net-metric">
        <div className="metric-label">
          <span>Net Bakiye</span>
          <span className="tiny-label">TRY</span>
        </div>
        <strong>{money(net)}</strong>
      </div>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(
        children as ReactElement<{ id: string; "aria-describedby"?: string }>,
        { id, "aria-describedby": hint ? `${id}-hint` : undefined },
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

const subscribeConnection = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};
export function useConnectionOnline() {
  return useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
    () => true,
  );
}
export function ConnectionNotice() {
  const online = useConnectionOnline();
  return online ? null : (
    <p className="connection-notice" role="status">
      İnternet bağlantısı yok. Kaydetmeden önce bağlantınızı kontrol edin.
    </p>
  );
}
