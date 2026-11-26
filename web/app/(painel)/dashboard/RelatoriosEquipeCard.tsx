"use client";

import { useEffect, useState } from "react";
import { Card, Icone } from "@/app/components/ui";
import type { Periodo } from "@/lib/painel";

interface AgenteLinha {
  id: string;
  nome: string;
  respostas: number;
  assumidas: number;
  delegacoesRecebidas: number;
  resolvidas: number;
  csatMedio: number | null;
  csatTotal: number;
}

interface RelatorioDados {
  periodoDias: number;
  agentes: AgenteLinha[];
  csat: {
    total: number;
    media: number | null;
    distribuicao: Record<1 | 2 | 3 | 4 | 5, number>;
  };
}

export function RelatoriosEquipeCard({ periodo }: { periodo: Periodo }) {
  const [dados, setDados] = useState<RelatorioDados | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/dashboard/relatorio?periodo=${periodo}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RelatorioDados | null) => {
        if (alive && d) setDados(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [periodo]);

  return (
    <Card
      largura="inteiro"
      icone={<Icone nome="users" />}
      titulo="Desempenho por atendente e CSAT"
      meta={`últimos ${periodo} dias`}
      acoes={
        <a
          href={`/api/dashboard/relatorio?periodo=${periodo}&formato=csv`}
          className="inline-flex h-8 items-center rounded-control border border-line bg-surface-2 px-3 text-[12.5px] font-medium text-fg hover:bg-elevated"
        >
          Exportar CSV
        </a>
      }
    >
      {!dados ? (
        <p className="text-[13px] text-fg-faint">Carregando métricas da equipe…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 rounded-control border border-line bg-surface-2 px-4 py-3 text-[13px]">
            <div>
              <span className="block text-[11.5px] text-fg-faint">CSAT Médio</span>
              <strong className="font-mono text-[18px] text-fg">
                {dados.csat.media !== null ? `${dados.csat.media.toFixed(1)} / 5` : "—"}
              </strong>
              <span className="ml-2 text-[12px] text-fg-dim">({dados.csat.total} avaliações)</span>
            </div>
            <div className="flex flex-wrap gap-2 text-[12px] text-fg-dim sm:ml-auto">
              {([5, 4, 3, 2, 1] as const).map((nota) => (
                <span key={nota} className="rounded-tag border border-line bg-surface px-2 py-0.5 font-mono">
                  {nota}★: {dados.csat.distribuicao[nota] ?? 0}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line text-[11.5px] text-fg-faint">
                <tr>
                  <th className="py-2 pr-3 font-medium">Atendente</th>
                  <th className="px-3 py-2 text-right font-medium">Respostas</th>
                  <th className="px-3 py-2 text-right font-medium">Assumidas</th>
                  <th className="px-3 py-2 text-right font-medium">Delegadas p/</th>
                  <th className="px-3 py-2 text-right font-medium">Resolvidas</th>
                  <th className="py-2 pl-3 text-right font-medium">CSAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dados.agentes.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3 font-medium text-fg">{a.nome}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{a.respostas}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{a.assumidas}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{a.delegacoesRecebidas}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{a.resolvidas}</td>
                    <td className="py-2 pl-3 text-right font-mono tabular-nums text-fg-dim">
                      {a.csatMedio !== null ? `${a.csatMedio.toFixed(1)} (${a.csatTotal})` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
