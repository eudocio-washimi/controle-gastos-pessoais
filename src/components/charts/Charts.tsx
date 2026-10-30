import {
  Bar, BarChart, CartesianGrid, ComposedChart, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps,
} from 'recharts';
import { useApp } from '../../context/AppContext.tsx';
import { formatBRLCompact, formatPct, monthLabel } from '../../lib/format.ts';
import { useMoney } from '../ui.tsx';

// Tokens visuais compartilhados por todos os gráficos.
const AXIS = { stroke: 'var(--axis)', tickLine: false, axisLine: false, tick: { fill: 'var(--muted)', fontSize: 11 } };
const GRID = { stroke: 'var(--grid)', strokeDasharray: '0', vertical: false };
const SERIES_1 = { light: '#2a78d6', dark: '#3987e5' };
const PREV = { light: '#c3c2b7', dark: '#52514e' };

function useCompactAxis() {
  const { hidden } = useApp();
  return (v: number) => (hidden ? '•••' : formatBRLCompact(v).replace('R$ ', ''));
}

function ChartTooltip({ active, payload, label, labelFormatter }: TooltipProps<number, string> & { labelFormatter?: (l: string) => string }) {
  const money = useMoney();
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== undefined && p.dataKey !== '__base');
  return (
    <div className="min-w-[160px] rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2 text-xs shadow-lg dark:border-white/10">
      {label !== undefined && <div className="mb-1 font-semibold text-[var(--ink)]">{labelFormatter ? labelFormatter(String(label)) : label}</div>}
      {rows.map((p) => (
        <div key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
            <span className="h-2 w-2 rounded-full" style={{ background: (p.payload?.fill as string) ?? p.color }} />
            {p.name}
          </span>
          <span className="num font-medium text-[var(--ink)]">{money(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

const legendStyle = { fontSize: 12, color: 'var(--ink-2)', paddingTop: 8 };

// 1. Rosca — distribuição por categoria
export interface Slice { key: string; label: string; value: number; color: string }

export function CategoryDonut({ data, onSelect, total }: { data: Slice[]; onSelect?: (key: string) => void; total: number }) {
  const money = useMoney();
  return (
    <div className="relative h-60">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={1.5}
            stroke="var(--surface)"
            strokeWidth={2}
            cornerRadius={4}
            onClick={(d) => onSelect?.((d as unknown as Slice).key)}
            className="cursor-pointer outline-none"
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-[var(--ink-2)]">Total</span>
        <span className="num text-lg font-semibold">{money(total)}</span>
      </div>
    </div>
  );
}

// 2. Barras agrupadas — mês atual vs anterior por categoria
export function CompareBars({ data }: { data: { label: string; atual: number; anterior: number }[] }) {
  const { dark } = useApp();
  const axis = useCompactAxis();
  return (
    <div style={{ height: Math.max(220, data.length * 44 + 60) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid {...GRID} vertical horizontal={false} />
          <XAxis type="number" {...AXIS} tickFormatter={axis} />
          <YAxis type="category" dataKey="label" {...AXIS} width={110} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
          <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
          <Bar dataKey="anterior" name="Mês anterior" fill={dark ? PREV.dark : PREV.light} radius={[0, 4, 4, 0]} barSize={10} />
          <Bar dataKey="atual" name="Mês atual" fill={dark ? SERIES_1.dark : SERIES_1.light} radius={[0, 4, 4, 0]} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 3 e 4. Linha — evolução mensal (saldo total / gastos totais)
export function TrendLine({ data, name, average }: { data: { month: string; value: number }[]; name: string; average?: number }) {
  const { dark } = useApp();
  const axis = useCompactAxis();
  const money = useMoney();
  const color = dark ? SERIES_1.dark : SERIES_1.light;
  const last = data.length - 1;
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="month" {...AXIS} tickFormatter={monthLabel} />
          <YAxis {...AXIS} tickFormatter={axis} width={64} domain={['auto', 'auto']} />
          <Tooltip content={<ChartTooltip labelFormatter={monthLabel} />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />
          {average !== undefined && (
            <ReferenceLine y={average} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: `média ${money(average)}`, position: 'insideTopLeft', fill: 'var(--muted)', fontSize: 11 }} />
          )}
          <Line
            type="monotone"
            dataKey="value"
            name={name}
            stroke={color}
            strokeWidth={2}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === last ? (
                <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
              ) : (
                <g key={p.index} />
              )
            }
            activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
          >
            <LabelList
              dataKey="value"
              content={(p) =>
                p.index === last ? (
                  <text x={Number(p.x)} y={Number(p.y) - 12} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--ink)">
                    {money(Number(p.value))}
                  </text>
                ) : null
              }
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// 5. Barras empilhadas — composição mensal por categoria
export function StackedMonthly({ data, series }: { data: Record<string, number | string>[]; series: { key: string; label: string; color: string }[] }) {
  const axis = useCompactAxis();
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey="month" {...AXIS} tickFormatter={monthLabel} />
          <YAxis {...AXIS} tickFormatter={axis} width={64} />
          <Tooltip content={<ChartTooltip labelFormatter={monthLabel} />} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
          <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="m"
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 6. Gauge — percentual do limite do cartão utilizado
export function Gauge({ pct }: { pct: number }) {
  const { dark } = useApp();
  const color = pct >= 0.9 ? 'var(--critical)' : pct >= 0.7 ? 'var(--warning)' : 'var(--good)';
  const track = dark ? '#2c2c2a' : '#e9e8e2';
  const value = Math.min(1, Math.max(0, pct));
  return (
    <div className="relative mx-auto h-28 w-48">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={[{ v: 1 }]} dataKey="v" startAngle={180} endAngle={0} cx="50%" cy="100%" innerRadius="140%" outerRadius="180%" fill={track} stroke="none" isAnimationActive={false} />
          <Pie data={[{ v: value }, { v: 1 - value }]} dataKey="v" startAngle={180} endAngle={0} cx="50%" cy="100%" innerRadius="140%" outerRadius="180%" stroke="none" cornerRadius={4}>
            <Cell fill={color} />
            <Cell fill="transparent" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="num text-2xl font-semibold">{formatPct(pct)}</div>
        <div className="text-[11px] text-[var(--ink-2)]">do limite usado</div>
      </div>
    </div>
  );
}

// 7. Barras horizontais — gasto vs limite por categoria
export function LimitBars({ data }: { data: { label: string; spent: number; limit: number; color: string }[] }) {
  const money = useMoney();
  // Eixo em % do limite, para que categorias com limites diferentes fiquem comparáveis.
  const rows = data.map((d) => ({ ...d, pct: d.spent / d.limit, pctLabel: `${Math.round((d.spent / d.limit) * 100)}%` }));
  const max = Math.max(1.2, ...rows.map((r) => r.pct * 1.05));
  return (
    <div style={{ height: Math.max(160, data.length * 40 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 48, top: 16 }} barCategoryGap="30%">
          <XAxis type="number" hide domain={[0, max]} />
          <YAxis type="category" dataKey="label" {...AXIS} width={110} />
          <ReferenceLine x={1} stroke="var(--ink-2)" strokeDasharray="3 3" label={{ value: 'limite', position: 'top', fill: 'var(--ink-2)', fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: 'var(--grid)', opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof rows)[number];
              return (
                <div className="rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2 text-xs shadow-lg dark:border-white/10">
                  <div className="mb-1 font-semibold">{d.label}</div>
                  <div className="text-[var(--ink-2)]">Gasto: <span className="num font-medium text-[var(--ink)]">{money(d.spent)}</span></div>
                  <div className="text-[var(--ink-2)]">Limite: <span className="num font-medium text-[var(--ink)]">{money(d.limit)}</span></div>
                </div>
              );
            }}
          />
          <Bar dataKey="pct" name="Gasto" radius={[0, 4, 4, 0]} barSize={14} background={{ fill: 'var(--grid)', radius: 4 }}>
            {rows.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
            <LabelList dataKey="pctLabel" position="right" fill="var(--ink-2)" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 8. Cascata — breakdown da previsão de saldo
export interface WaterfallStep { label: string; value: number; kind: 'total' | 'delta' }

export function Waterfall({ steps }: { steps: WaterfallStep[] }) {
  const { dark } = useApp();
  const axis = useCompactAxis();
  const money = useMoney();
  let running = 0;
  const data = steps.map((s) => {
    if (s.kind === 'total') {
      running = s.value;
      return { label: s.label, __base: Math.min(0, s.value), value: Math.abs(s.value), raw: s.value, color: dark ? SERIES_1.dark : SERIES_1.light };
    }
    const start = running;
    running += s.value;
    return {
      label: s.label,
      __base: Math.min(start, running),
      value: Math.abs(s.value),
      raw: s.value,
      color: s.value >= 0 ? 'var(--good)' : 'var(--critical)',
    };
  });
  // Eixo truncado perto dos valores: senão as variações somem diante do saldo total.
  const levels = data.flatMap((d, i) => (steps[i].kind === 'total' ? [d.raw] : [d.__base, d.__base + d.value]));
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const pad = Math.max((max - min) * 0.6, Math.abs(max) * 0.02, 1);
  const lo = min > 0 ? Math.max(0, Math.floor((min - pad) / 100) * 100) : Math.floor((min - pad) / 100) * 100;
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} interval={0} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
          <YAxis {...AXIS} tickFormatter={axis} width={64} domain={[lo, 'auto']} allowDataOverflow />
          <Tooltip
            cursor={{ fill: 'var(--grid)', opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2 text-xs shadow-lg dark:border-white/10">
                  <div className="font-semibold">{d.label}</div>
                  <div className="num">{money(d.raw)}</div>
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Bar dataKey="__base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="w" radius={[4, 4, 4, 4]}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
            <LabelList
              dataKey="raw"
              position="top"
              content={(p) => (
                <text x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 6} textAnchor="middle" fontSize={10} fill="var(--ink-2)">
                  {money(Number(p.value) || 0).replace('R$ ', '')}
                </text>
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 8. Projeção — saídas empilhadas por mês (mesmo eixo em R$) com a receita como linha de referência
export function ProjectionBars({
  data, series, incomeLabel, selected, onSelect,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string; color: string }[];
  incomeLabel: string;
  /** Mês em destaque; os demais ficam esmaecidos. */
  selected?: string;
  onSelect?: (month: string) => void;
}) {
  const axis = useCompactAxis();
  return (
    <div>
      <div className="h-64">
      <ResponsiveContainer>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barCategoryGap="24%"
          onClick={(e) => e?.activeLabel && onSelect?.(String(e.activeLabel))}
          style={{ cursor: onSelect ? 'pointer' : undefined }}
        >
          <CartesianGrid {...GRID} />
          <XAxis dataKey="month" {...AXIS} tickFormatter={monthLabel} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...AXIS} tickFormatter={axis} width={64} />
          <Tooltip content={<ChartTooltip labelFormatter={monthLabel} />} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="saidas"
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            >
              {data.map((d) => (
                <Cell key={String(d.month)} fillOpacity={!selected || d.month === selected ? 1 : 0.35} />
              ))}
            </Bar>
          ))}
          <Line
            type="monotone"
            dataKey="income"
            name={incomeLabel}
            stroke="var(--ink-2)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      {/* Legenda em HTML: quebra linha no celular sem invadir o eixo. */}
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-[var(--ink-2)]">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="w-3 border-t-2 border-dashed border-[var(--ink-2)]" />
          {incomeLabel}
        </li>
      </ul>
    </div>
  );
}
