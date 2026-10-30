import { Check, Copy, Download, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MonthPicker } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { AI_PROMPT, buildReport } from '../lib/report.ts';

export default function ReportPage() {
  const { payload, txs, limits, occurrences, month } = useApp();
  const [copied, setCopied] = useState(false);
  const report = useMemo(() => buildReport(month, payload!.accounts, txs, limits, occurrences), [month, payload, txs, limits, occurrences]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      // Fallback para navegadores sem Clipboard API (ex.: http em rede local).
      const ta = document.createElement('textarea');
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-financeiro-${month}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <Sparkles size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="card-title">Relatório mensal para análise com IA</div>
            <p className="card-sub mt-1">
              Copie o texto abaixo e cole na sua IA preferida. A instrução <em>“{AI_PROMPT}”</em> já vai no final.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <MonthPicker />
          <div className="flex gap-2">
            <button className="btn-outline" onClick={download}>
              <Download size={16} /> Baixar .txt
            </button>
            <button className="btn-primary" onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      </div>
      <pre className="card overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--ink)]">{report}</pre>
    </div>
  );
}
