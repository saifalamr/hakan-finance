"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type Data,
  type Transaction,
  emptyData,
  currentMonth,
} from "@/lib/finance";
import { type Snapshot, localSnapshot } from "@/lib/business";
import { demoAllowed, supabase } from "@/lib/supabase";
import { demoUser, makeDemo } from "@/lib/demo";
import type { PostgrestError } from "@supabase/supabase-js";
export type Table = Exclude<keyof Data, "export_context">;
type RecordInput = Record<string, string | number | null>;
type Store = {
  data: Data;
  userId: string;
  ready: boolean;
  loaded: boolean;
  loading: boolean;
  loadError: string;
  demo: boolean;
  refresh: () => Promise<void>;
  save: (
    table: Table,
    values: RecordInput,
    id?: string,
    requestId?: string,
  ) => Promise<string>;
  businessReady: boolean;
  revision: number;
  getSnapshot: (month: string) => Promise<Snapshot>;
  remove: (table: Table, id: string) => Promise<void>;
  startDemo: () => void;
  signOut: () => Promise<void>;
  toast: string;
  notify: (message: string) => void;
  upgradeReady: boolean;
  trash: Transaction[];
  lastDeleted: string;
  restore: (id: string) => Promise<void>;
};
const Context = createContext<Store | null>(null);
const DEMO_KEY = "finance-development-demo-v1";
export function errorMessage(error: unknown): string {
  const e = error as PostgrestError;
  if (e?.code === "53100" || e?.code === "25006")
    return "Veritabanı yeni kayıt kabul etmiyor. Supabase kapasitesini kontrol edin.";
  if (
    e?.message?.includes("AbortError") ||
    e?.message?.includes("TimeoutError") ||
    e?.details?.includes("TimeoutError")
  )
    return "Bağlantı zaman aşımına uğradı. Tekrar kaydetmeden önce yenileyip kaydın oluşup oluşmadığını kontrol edin.";
  if (
    e?.message?.includes("vehicle_archived") ||
    e?.message?.includes("employee_archived")
  )
    return "Arşivlenmiş bir kayda yeni işlem eklenemez. Önce yeniden aktif edin.";
  if (e?.message?.includes("recurring_not_due"))
    return "Bu giderin tarihi henüz gelmedi veya daha önce kaydedildi. Yenileyin.";
  if (e?.message?.includes("invalid_receipt_path"))
    return "Belge bağlantısı geçersiz. Dosyayı yeniden seçin.";
  if (
    e?.message?.includes("new row violates row-level security policy") &&
    "statusCode" in e
  )
    return "Belge yüklenemedi. Dosya ve alan sınırlarını veya yönetici erişimini kontrol edin.";
  if (e?.code === "23503")
    return "Bağlı kayıtlar nedeniyle bu işlem yapılamıyor. Geçmiş kayıtlar korunur.";
  if (e?.code === "23505") return "Bu kayıt zaten mevcut.";
  if (e?.code === "42501")
    return "Bu işlem için yetkiniz yok. Yönetici hesabını kontrol edin.";
  if (e?.message?.includes("payroll_period_required"))
    return "Önce bu ayın maaş planını kaydedin.";
  if (e?.code === "23514" || e?.code === "P0001")
    return "Kayıt bilgileri geçersiz. Tutarı, kategoriyi ve bağlantıları kontrol edin.";
  return error instanceof Error && !("code" in error)
    ? error.message
    : "İşlem tamamlanamadı. Bağlantınızı kontrol edip yeniden deneyin.";
}
async function readAll(table: Table, userId: string, signal: AbortSignal) {
  const rows: Record<string, unknown>[] = [];
  let cursor = "";
  while (true) {
    let query = supabase!
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("id")
      .limit(500)
      .abortSignal(signal);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
    const next = String(data[data.length - 1].id);
    if (next <= cursor)
      throw new Error("Kayıtlar yüklenemedi. Yeniden deneyin.");
    cursor = next;
    // Yield between pages so taps and paints are not blocked by a large history.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return rows;
}
export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(emptyData),
    [userId, setUserId] = useState(""),
    [ready, setReady] = useState(!supabase),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [demo, setDemo] = useState(false),
    [toast, setToast] = useState(""),
    [upgradeReady, setUpgradeReady] = useState(false),
    [lastDeleted, setLastDeleted] = useState(""),
    [businessReady, setBusinessReady] = useState(false),
    [revision, setRevision] = useState(0);
  const demoData = useRef(data);
  const snapshots = useRef(new Map<string, Promise<Snapshot>>());
  const sequence = useRef(0);
  const authSequence = useRef(0);
  const authenticatedUser = useRef("");
  const reading = useRef<{
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const writing = useRef(false);
  const cancelRead = () => {
    reading.current?.controller.abort();
    reading.current = null;
    sequence.current++;
    setLoading(false);
  };
  useEffect(() => () => reading.current?.controller.abort(), []);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = useCallback((): Promise<void> => {
    if (demo || !userId || writing.current) return Promise.resolve();
    if (reading.current) return reading.current.promise;
    const run = ++sequence.current;
    const controller = new AbortController();
    // A finite total budget prevents a stalled multi-page load from spinning forever.
    const deadline = setTimeout(() => controller.abort(), 90000);
    setLoading(true);
    setLoadError("");
    const promise = (async () => {
      try {
        const tables: Table[] = [
          "transactions",
          "vehicles",
          "employees",
          "categories",
          "employee_periods",
        ];
        let business = false;
        try {
          const { data: summary, error } = await supabase!
            .rpc("finance_summary", { p_month: currentMonth() + "-01" })
            .abortSignal(controller.signal);
          if (error && !["PGRST202", "42883"].includes(error.code)) throw error;
          if (!error && summary?.month) {
            business = true;
            snapshots.current.set(
              currentMonth(),
              Promise.resolve(summary as Snapshot),
            );
          }
        } catch (error) {
          throw error;
        }
        const settingsPromise = readAll(
          "finance_settings",
          userId,
          controller.signal,
        )
          .then((rows) => ({ rows, upgraded: true }))
          .catch((error) => {
            const code = (error as PostgrestError).code;
            if (code !== "42P01" && code !== "PGRST205") throw error;
            return { rows: [], upgraded: false };
          });
        const [rows, settings] = await Promise.all([
          Promise.all(
            tables.map(async (table) => {
              if (!business) return readAll(table, userId, controller.signal);
              if (table === "transactions") {
                const { data: page, error } = await supabase!
                  .rpc("finance_transactions", { p_limit: 40 })
                  .abortSignal(controller.signal);
                if (error) throw error;
                const { data: trash, error: trashError } = await supabase!
                  .rpc("finance_transactions", { p_limit: 40, p_trash: true })
                  .abortSignal(controller.signal);
                if (trashError) throw trashError;
                return [...page.rows.slice(0, 40), ...trash.rows.slice(0, 40)];
              }
              if (table === "employee_periods") {
                const { data: periods, error } = await supabase!
                  .from(table)
                  .select("*")
                  .eq("user_id", userId)
                  .eq("month", currentMonth() + "-01")
                  .abortSignal(controller.signal);
                if (error) throw error;
                return periods || [];
              }
              return readAll(table, userId, controller.signal);
            }),
          ),
          settingsPromise,
        ]);
        if (sequence.current === run) {
          setBusinessReady(business);
          let recurring: unknown[] = [];
          if (business)
            recurring = await readAll(
              "recurring_expenses",
              userId,
              controller.signal,
            );
          if (sequence.current !== run) return;
          setUpgradeReady(settings.upgraded);
          setData({
            ...Object.fromEntries(tables.map((table, i) => [table, rows[i]])),
            finance_settings: settings.rows,
            recurring_expenses: recurring,
          } as Data);
          setRevision((n) => n + 1);
          setLoaded(true);
        }
      } catch (error) {
        if (sequence.current === run)
          setLoadError(
            controller.signal.aborted
              ? "Yükleme zaman aşımına uğradı. Bağlantınızı kontrol edip yeniden deneyin."
              : errorMessage(error),
          );
      } finally {
        clearTimeout(deadline);
        controller.abort();
        if (reading.current?.controller === controller) reading.current = null;
        if (sequence.current === run) setLoading(false);
      }
    })();
    reading.current = { controller, promise };
    return promise;
  }, [demo, userId]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const check = async () => {
      const run = ++authSequence.current;
      const { data: auth, error } = await supabase!.auth.getUser();
      if (!active || authSequence.current !== run) return;
      if (error && error.name !== "AuthSessionMissingError")
        setLoadError("Oturum doğrulanamadı. Bağlantınızı kontrol edin.");
      if (auth.user) {
        const { data: admin, error: adminError } = await supabase!
          .from("app_admin")
          .select("user_id")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (!active || authSequence.current !== run) return;
        if (adminError || !admin) {
          setLoadError("Bu hesap yönetici olarak tanımlanmamış.");
          setUserId("");
        } else {
          if (authenticatedUser.current !== auth.user.id) {
            reading.current?.controller.abort();
            reading.current = null;
            sequence.current++;
            setData(emptyData);
            setLoaded(false);
            setLoading(true);
          }
          authenticatedUser.current = auth.user.id;
          setUserId(auth.user.id);
          setLoadError("");
        }
      } else {
        setUserId("");
        setData(emptyData);
      }
      setReady(true);
    };
    void check();
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) {
        reading.current?.controller.abort();
        reading.current = null;
        sequence.current++;
        authSequence.current++;
        authenticatedUser.current = "";
        setUserId("");
        setData(emptyData);
        setLoaded(false);
        setLoading(false);
        setReady(true);
      } else if (event === "SIGNED_IN") {
        setTimeout(() => {
          if (active) void check();
        }, 0);
      }
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!userId || demo) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [userId, demo, refresh]);
  function persist(next: Data) {
    demoData.current = next;
    snapshots.current.clear();
    setRevision((n) => n + 1);
    localStorage.setItem(DEMO_KEY, JSON.stringify(next));
    setData(next);
  }
  function startDemo() {
    if (!demoAllowed) return;
    let stored: Data | undefined;
    try {
      const value = localStorage.getItem(DEMO_KEY);
      if (value) stored = JSON.parse(value);
    } catch {
      /* Reset invalid development data. */
    }
    snapshots.current.clear();
    setBusinessReady(true);
    setDemo(true);
    setUpgradeReady(true);
    setLoaded(true);
    setUserId(demoUser);
    setReady(true);
    setLoadError("");
    demoData.current = stored || makeDemo();
    setData(demoData.current);
  }
  async function save(
    table: Table,
    values: RecordInput,
    id?: string,
    requestId?: string,
  ) {
    if (!userId) throw new Error("Lütfen giriş yapın.");
    if (demo) {
      const next = structuredClone(demoData.current);
      const record = {
        ...values,
        user_id: userId,
        id: id || requestId || crypto.randomUUID(),
      };
      const rows = (next[table] ||= []) as unknown as RecordInput[];
      if (!id && requestId && rows.some((r) => r.id === requestId))
        return requestId;
      if (table === "finance_settings") {
        rows.splice(0, rows.length, record);
      } else if (table === "employee_periods") {
        const index = rows.findIndex(
          (r) =>
            r.employee_id === values.employee_id && r.month === values.month,
        );
        if (index >= 0) {
          record.id = rows[index].id as string;
          rows[index] = record;
        } else rows.push(record);
      } else if (id) {
        const index = rows.findIndex((r) => r.id === id);
        if (index < 0) throw new Error("Kayıt bulunamadı.");
        rows[index] = { ...rows[index], ...record };
      } else {
        rows.push({ created_at: new Date().toISOString(), ...record });
      }
      if (table === "employees" && !id)
        next.employee_periods.push({
          id: crypto.randomUUID(),
          user_id: userId,
          employee_id: record.id as string,
          month: `${currentMonth()}-01`,
          salary: values.salary as number,
          work_days: values.work_days as number,
        });
      persist(next);
      return record.id as string;
    }
    if (writing.current)
      throw new Error("Önceki kayıt tamamlanıyor. Lütfen bekleyin.");
    writing.current = true;
    cancelRead();
    const owner = userId;
    try {
      const query =
        table === "finance_settings"
          ? supabase!
              .from(table)
              .upsert({ ...values, user_id: userId }, { onConflict: "user_id" })
          : table === "employee_periods"
            ? supabase!
                .from(table)
                .upsert(
                  { ...values, user_id: userId },
                  { onConflict: "user_id,employee_id,month" },
                )
            : id
              ? supabase!.from(table).update(values).eq("id", id)
              : supabase!.from(table).insert({
                  ...values,
                  user_id: userId,
                  ...(requestId ? { id: requestId } : {}),
                  ...(businessReady && table === "transactions" && requestId
                    ? { client_request_id: requestId }
                    : {}),
                });
      let { data: saved, error } = await query.select("*");
      if (error?.code === "23505" && requestId && !id) {
        const existing = await supabase!
          .from(table)
          .select("*")
          .eq("id", requestId)
          .eq("user_id", owner);
        if (existing.data?.length) {
          if (
            Object.entries(values).some(
              ([key, value]) => existing.data![0][key] !== value,
            )
          )
            throw new Error(
              "Önceki kayıt kaydedilmiş. Yenileyip mevcut kaydı düzenleyin.",
            );
          saved = existing.data;
          error = null;
        }
      }
      if (error) throw error;
      if (!saved?.length)
        throw new Error("Kayıt kaydedilemedi. Yetkinizi kontrol edin.");
      if (authenticatedUser.current !== owner) return saved[0].id;
      setData((previous) => {
        const next = { ...previous };
        const ids = new Set(saved.map((row) => row.id));
        next[table] = [
          ...(previous[table] || []).filter((row) => !ids.has(row.id)),
          ...saved,
        ] as never;
        return next;
      });
      setLoadError("");
      // Creating an employee also creates the current payroll period via a DB trigger.
      if (table === "employees" && !id) {
        const { data: periods, error: periodError } = await supabase!
          .from("employee_periods")
          .select("*")
          .eq("employee_id", saved[0].id)
          .eq("user_id", owner);
        if (authenticatedUser.current !== owner) return saved[0].id;
        if (periodError)
          setLoadError(
            "Personel kaydedildi. Maaş planını görmek için yenileyin.",
          );
        else
          setData((previous) => ({
            ...previous,
            employee_periods: [
              ...previous.employee_periods.filter(
                (p) => p.employee_id !== saved[0].id,
              ),
              ...(periods || []),
            ],
          }));
      }
      snapshots.current.clear();
      setRevision((n) => n + 1);
      return saved[0].id as string;
    } finally {
      writing.current = false;
    }
  }
  async function remove(table: Table, id: string) {
    if (table === "transactions") {
      if (!upgradeReady)
        throw new Error(
          "Geri alınabilir silme için veritabanı güncellemesini tamamlayın.",
        );
      await save("transactions", { deleted_at: new Date().toISOString() }, id);
      setLastDeleted(id);
      return;
    }
    if (table === "vehicles" || table === "employees") {
      if (!businessReady)
        throw new Error("Arşivleme için veritabanı güncellemesini tamamlayın.");
      await save(table, { archived_at: new Date().toISOString() }, id);
      return;
    }
    if (demo) {
      if (
        data.transactions.some(
          (t) =>
            t.vehicle_id === id || t.employee_id === id || t.category_id === id,
        )
      )
        throw new Error(
          "Bağlı kayıtlar nedeniyle bu işlem yapılamıyor. Geçmiş kayıtlar korunur.",
        );
      const next = structuredClone(demoData.current);
      next[table] = (next[table] || []).filter((row) => row.id !== id) as never;

      persist(next);
      return;
    }
    if (writing.current)
      throw new Error("Önceki kayıt tamamlanıyor. Lütfen bekleyin.");
    writing.current = true;
    cancelRead();
    const owner = userId;
    try {
      const { data: deleted, error } = await supabase!
        .from(table)
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!deleted?.length) throw new Error("Kayıt silinemedi.");
      if (authenticatedUser.current !== owner) return;
      setData((previous) => ({
        ...previous,
        [table]: (previous[table] || []).filter((row) => row.id !== id),
      }));
      snapshots.current.clear();
      setRevision((n) => n + 1);
      setLoadError("");
    } finally {
      writing.current = false;
    }
  }
  async function restore(id: string) {
    await save("transactions", { deleted_at: null }, id);
    setLastDeleted("");
    notify("İşlem geri yüklendi.");
  }
  async function signOut() {
    if (supabase && !demo) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    cancelRead();
    authSequence.current++;
    authenticatedUser.current = "";
    setUserId("");
    setData(emptyData);
    setLastDeleted("");
    snapshots.current.clear();
    setBusinessReady(false);
    setUpgradeReady(false);
    setDemo(false);
    setLoaded(false);
    setLoadError("");
  }
  const getSnapshot = useCallback(
    async (month: string): Promise<Snapshot> => {
      if (demo || !businessReady) return localSnapshot(data, month);
      if (snapshots.current.has(month)) return snapshots.current.get(month)!;
      const promise = (async () => {
        const { data: result, error } = await supabase!.rpc("finance_summary", {
          p_month: month + "-01",
        });
        if (error) throw error;
        return result as Snapshot;
      })();
      snapshots.current.set(month, promise);
      if (snapshots.current.size > 4)
        snapshots.current.delete(snapshots.current.keys().next().value!);
      try {
        return await promise;
      } catch (error) {
        snapshots.current.delete(month);
        throw error;
      }
    },
    [data, demo, businessReady],
  );
  const activeData = useMemo(
    () => ({
      ...data,
      transactions: data.transactions.filter((t) => !t.deleted_at),
    }),
    [data],
  );
  const trash = useMemo(
    () => data.transactions.filter((t) => t.deleted_at),
    [data.transactions],
  );
  return (
    <Context.Provider
      value={{
        data: activeData,
        businessReady,
        revision,
        getSnapshot,
        trash,
        upgradeReady,
        lastDeleted,
        restore,
        userId,
        ready,
        loaded,
        loading,
        loadError,
        demo,
        refresh,
        save,
        remove,
        startDemo,
        signOut,
        toast,
        notify,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useData() {
  const context = useContext(Context);
  if (!context) throw new Error("Missing data provider");
  return context;
}
