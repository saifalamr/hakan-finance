"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  compactMoney,
  dailyChart,
  money,
  type Transaction,
} from "@/lib/finance";
import { EmptyState } from "./ui";
export function CashChart({
  transactions,
  month,
  daily,
}: {
  daily?: { day: number; Gelir: number; Gider: number }[];
  transactions: Transaction[];
  month: string;
}) {
  if (
    daily
      ? !daily.some((d) => d.Gelir || d.Gider)
      : !transactions.some((t) => t.type !== "adjustment")
  )
    return (
      <EmptyState
        title="Bu ayın grafiği burada"
        text="Gelir ve gider ekledikçe günlük akışınızı görün."
      />
    );
  return (
    <>
      <div className="chart-legend">
        <span>
          <i className="income-dot" />
          Gelir
        </span>
        <span>
          <i className="expense-dot" />
          Gider
        </span>
      </div>
      <div
        className="chart-frame"
        role="img"
        aria-label="Ay boyunca günlük gelir ve gider grafiği"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 320, height: 200 }}
        >
          <AreaChart
            data={
              daily
                ? daily.map((d) => ({ ...d, day: String(d.day) }))
                : dailyChart(transactions, month)
            }
            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          >
            <CartesianGrid stroke="#edf0f0" vertical={false} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              interval={6}
              tick={{ fill: "#7b8684", fontSize: 11 }}
              dy={9}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#7b8684", fontSize: 11 }}
              width={65}
              tickFormatter={(v) => compactMoney(Number(v) * 100)}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e7ebea",
                fontSize: 12,
              }}
              labelFormatter={(v) => `${v}. gün`}
              formatter={(v) => money(Number(v) * 100)}
            />
            <Area
              dataKey="Gelir"
              type="monotone"
              stroke="#287c62"
              fill="#edf6f1"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              dataKey="Gider"
              type="monotone"
              stroke="#c56a65"
              fill="#fbefed"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
const colors = ["#174f46", "#468678", "#80a89b", "#b0c6bc", "#d6e1db"];
export function BreakdownChart({
  data,
  label,
}: {
  data: { name: string; value: number }[];
  label: string;
}) {
  if (!data.length)
    return (
      <EmptyState
        title="Henüz gider yok"
        text="Giderler kaydedildiğinde dağılım burada görünür."
      />
    );
  const max = Math.max(...data.map((row) => row.value));
  return (
    <div className="breakdown" aria-label={label}>
      {data.map((row, i) => (
        <div key={`${row.name}-${i}`} className="breakdown-row">
          <div>
            <span>{row.name}</span>
            <strong>{money(row.value)}</strong>
          </div>
          <div className="bar-track">
            <span
              style={{
                width: `${Math.max(2, (row.value / max) * 100)}%`,
                background: colors[Math.min(i, colors.length - 1)],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
export function MonthlyChart({
  data,
  expenseOnly = false,
}: {
  data: { name: string; Gelir: number; Gider: number }[];
  expenseOnly?: boolean;
}) {
  if (!data.some((d) => d.Gelir || d.Gider))
    return <EmptyState title="Henüz rapor verisi yok" />;
  return (
    <>
      <div className="chart-legend">
        {!expenseOnly && (
          <span>
            <i className="income-dot" />
            Gelir
          </span>
        )}
        <span>
          <i className="expense-dot" />
          Gider
        </span>
      </div>
      <div
        className={`chart-frame${expenseOnly ? " vehicle-trend-chart" : ""}`}
        role="img"
        aria-label={
          expenseOnly
            ? "Aylık araç gider eğilimi"
            : "Son altı ayın gelir ve gider karşılaştırması"
        }
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 320, height: 200 }}
        >
          <BarChart
            data={data}
            margin={{ top: 10, right: 0, left: -12, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="#edf0f0" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#7b8684" }}
            />
            <YAxis
              width={65}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#7b8684" }}
              tickFormatter={(v) => compactMoney(Number(v))}
            />
            <Tooltip
              formatter={(v) => money(Number(v))}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e7ebea",
              }}
            />
            {!expenseOnly && (
              <Bar
                dataKey="Gelir"
                fill="#287c62"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            )}
            <Bar
              dataKey="Gider"
              fill="#c56a65"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
