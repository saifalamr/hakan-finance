"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useData, errorMessage } from "./data-provider";
import { supabase } from "@/lib/supabase";
import { type Snapshot } from "@/lib/business";
import { type Transaction, totals, payrollLabels } from "@/lib/finance";
export function useSnapshot(month: string) {
  const { getSnapshot, revision } = useData();
  const identity = `${month}:${revision}`;
  const [resolved, setResolved] = useState("");
  const [value, setValue] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      getSnapshot(month)
        .then((v) => {
          if (active) setValue(v);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        })
        .finally(() => {
          if (active) {
            setLoading(false);
            setResolved(identity);
          }
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [month, revision, getSnapshot, identity]);
  const pending = resolved !== identity;
  return {
    value: !pending && !error && value?.month === month ? value : null,
    error: pending ? "" : error,
    loading: pending || loading,
  };
}
export type PageOptions = {
  start?: string;
  end?: string;
  vehicle?: string;
  employee?: string;
  type?: string;
  search?: string;
  trash?: boolean;
};
export function useTransactionPage(options: PageOptions) {
  const { data, trash, demo, businessReady, revision } = useData();
  const key = JSON.stringify(options),
    [rows, setRows] = useState<Transaction[]>([]),
    [count, setCount] = useState(0),
    [total, setTotal] = useState(totals([])),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [hasMore, setHasMore] = useState(false),
    [retry, setRetry] = useState(0);
  const identity = `${key}:${revision}:${retry}`;
  const [resolved, setResolved] = useState("");
  const cursor = useRef<Transaction | null>(null),
    busy = useRef(false),
    sequence = useRef(0),
    visible = useRef(0);
  const load = useCallback(
    async (append = false) => {
      if (append && busy.current) return;
      const run = ++sequence.current;
      busy.current = true;
      setLoading(true);
      setError("");
      try {
        const o = JSON.parse(key) as PageOptions;
        if (demo || !businessReady) {
          const names = new Map(data.categories.map((c) => [c.id, c.name]));
          const all = (o.trash ? trash : data.transactions)
            .filter(
              (t) =>
                !!t.deleted_at === !!o.trash &&
                (!o.start || t.date >= o.start) &&
                (!o.end || t.date <= o.end) &&
                (!o.vehicle || t.vehicle_id === o.vehicle) &&
                (!o.employee || t.employee_id === o.employee) &&
                (!o.type || t.type === o.type) &&
                (!o.search ||
                  `${t.description} ${names.get(t.category_id || "")} ${t.payroll_kind ? payrollLabels[t.payroll_kind] : ""}`
                    .toLocaleLowerCase("tr-TR")
                    .includes(o.search.toLocaleLowerCase("tr-TR"))),
            )
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date) ||
                b.created_at.localeCompare(a.created_at) ||
                b.id.localeCompare(a.id),
            );
          const n = append ? visible.current + 40 : 40;
          visible.current = n;
          setRows(all.slice(0, n));
          setCount(all.length);
          setTotal(totals(all));
          setHasMore(all.length > n);
          return;
        }
        const c = append ? cursor.current : null;
        const { data: page, error: e } = await supabase!.rpc(
          "finance_transactions",
          {
            p_start: o.start || null,
            p_end: o.end || null,
            p_vehicle: o.vehicle || null,
            p_employee: o.employee || null,
            p_type: o.type || null,
            p_search: o.search || "",
            p_trash: !!o.trash,
            p_cursor_date: c?.date || null,
            p_cursor_created: c?.created_at || null,
            p_cursor_id: c?.id || null,
            p_limit: 40,
          },
        );
        if (e) throw e;
        if (run !== sequence.current) return;
        const selected = page.rows.slice(0, 40) as Transaction[];
        cursor.current = selected.at(-1) || null;
        setRows((previous) => (append ? [...previous, ...selected] : selected));
        setCount(page.count);
        setTotal(page.total);
        setHasMore(page.rows.length > 40);
      } catch (e) {
        if (run === sequence.current) setError(errorMessage(e));
      } finally {
        if (run === sequence.current) {
          busy.current = false;
          setLoading(false);
          setResolved(identity);
        }
      }
      // Append uses currently rendered length only for development/compatibility.
    },
    [key, data, trash, demo, businessReady, identity],
  );
  useEffect(() => {
    cursor.current = null;
    const timer = setTimeout(() => void load(), 150);
    const invalidate = () => {
      sequence.current++;
      busy.current = false;
    };
    return () => {
      clearTimeout(timer);
      invalidate();
    };
  }, [key, revision, retry, load]);
  return {
    rows: resolved === identity && !error ? rows : [],
    count: resolved === identity && !error ? count : 0,
    total: resolved === identity && !error ? total : totals([]),
    loading: resolved !== identity || loading,
    error: resolved === identity ? error : "",
    hasMore: resolved === identity && !error && hasMore,
    more: () => void load(true),
    reload: () => setRetry((n) => n + 1),
  };
}
