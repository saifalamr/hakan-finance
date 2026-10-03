"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type Data, emptyData, currentMonth } from "@/lib/finance";
import { demoAllowed, supabase } from "@/lib/supabase";
import { demoUser, makeDemo } from "@/lib/demo";
import type { PostgrestError } from "@supabase/supabase-js";
export type Table = keyof Data;
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
  save: (table: Table, values: RecordInput, id?: string) => Promise<void>;
  remove: (table: Table, id: string) => Promise<void>;
  startDemo: () => void;
  signOut: () => Promise<void>;
  toast: string;
  notify: (message: string) => void;
};
const Context = createContext<Store | null>(null);
const DEMO_KEY = "finance-development-demo-v1";
export function errorMessage(error: unknown): string {
  const e = error as PostgrestError;
  if (e?.code === "23503")
    return "Bu kayıt işlemlerde kullanılıyor. Önce bağlı işlemleri kaldırın.";
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
async function readAll(table: Table) {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase!
      .from(table)
      .select("*")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
    offset += 500;
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
    [toast, setToast] = useState("");
  const sequence = useRef(0);
  const authenticatedUser = useRef("");
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = useCallback(async () => {
    if (demo) return;
    const run = ++sequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const tables: Table[] = [
        "transactions",
        "vehicles",
        "employees",
        "categories",
        "employee_periods",
      ];
      const rows = await Promise.all(tables.map(readAll));
      if (sequence.current === run) {
        setData(
          Object.fromEntries(
            tables.map((table, i) => [table, rows[i]]),
          ) as Data,
        );
        setLoaded(true);
      }
    } catch (error) {
      if (sequence.current === run) setLoadError(errorMessage(error));
    } finally {
      if (sequence.current === run) setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const check = async () => {
      const run = ++sequence.current;
      const { data: auth, error } = await supabase!.auth.getUser();
      if (!active || sequence.current !== run) return;
      if (error && error.name !== "AuthSessionMissingError")
        setLoadError("Oturum doğrulanamadı. Bağlantınızı kontrol edin.");
      if (auth.user) {
        const { data: admin, error: adminError } = await supabase!
          .from("app_admin")
          .select("user_id")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (!active || sequence.current !== run) return;
        if (adminError || !admin) {
          setLoadError("Bu hesap yönetici olarak tanımlanmamış.");
          setUserId("");
        } else {
          if (authenticatedUser.current !== auth.user.id) setLoading(true);
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
        sequence.current++;
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
    setDemo(true);
    setLoaded(true);
    setUserId(demoUser);
    setReady(true);
    setLoadError("");
    setData(stored || makeDemo());
  }
  async function save(table: Table, values: RecordInput, id?: string) {
    if (!userId) throw new Error("Lütfen giriş yapın.");
    if (demo) {
      const next = structuredClone(data);
      const record = {
        ...values,
        user_id: userId,
        id: id || crypto.randomUUID(),
      };
      const rows = next[table] as unknown as RecordInput[];
      if (table === "employee_periods") {
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
      return;
    }
    const query =
      table === "employee_periods"
        ? supabase!
            .from(table)
            .upsert(
              { ...values, user_id: userId },
              { onConflict: "user_id,employee_id,month" },
            )
        : id
          ? supabase!.from(table).update(values).eq("id", id)
          : supabase!.from(table).insert({ ...values, user_id: userId });
    const { data: saved, error } = await query.select("id");
    if (error) throw error;
    if (!saved?.length)
      throw new Error("Kayıt kaydedilemedi. Yetkinizi kontrol edin.");
    await refresh();
  }
  async function remove(table: Table, id: string) {
    if (demo) {
      if (
        table !== "transactions" &&
        data.transactions.some(
          (t) =>
            t.vehicle_id === id || t.employee_id === id || t.category_id === id,
        )
      )
        throw new Error(
          "Bu kayıt işlemlerde kullanılıyor. Önce bağlı işlemleri kaldırın.",
        );
      const next = structuredClone(data);
      next[table] = next[table].filter((row) => row.id !== id) as never;
      if (table === "employees")
        next.employee_periods = next.employee_periods.filter(
          (p) => p.employee_id !== id,
        );
      persist(next);
      return;
    }
    const { data: deleted, error } = await supabase!
      .from(table)
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!deleted?.length) throw new Error("Kayıt silinemedi.");
    await refresh();
  }
  async function signOut() {
    if (supabase && !demo) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    sequence.current++;
    setUserId("");
    setData(emptyData);
    setDemo(false);
    setLoaded(false);
    setLoadError("");
  }
  return (
    <Context.Provider
      value={{
        data,
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
