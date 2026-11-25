"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AtribuicaoFila } from "@/lib/caixa";
import type { UltimoAtendimento } from "@/lib/ultimo-atendimento";
import type { RotasPainel } from "@/lib/rotas-painel";
import { checarSessao, useRotas } from "../RotasPainel";
import { Button, Icone, Select, cn } from "../ui";

export interface AtribuicaoConversaProps {
  slug: string;
  /** Login de quem olha, ou `@dono`. */
  eu: string;
  inicial: AtribuicaoFila;
  departamentos: { id: string; nome: string }[];
  /** Quem pode receber a conversa (sem quem está olhando). */
  equipe: { id: string; nome: string }[];
  ultimoAtendimento?: UltimoAtendimento | null;
}

const ROTA = "/api/atendimento/atribuicao";

/** Corpo do contrato da rota: `{ slug, acao, para?, departamento? }`. */
export type CorpoAtribuicao = { acao: "assumir" | "soltar" | "resolver" | "delegar" | "departamento"; para?: string; departamento?: string | null };

/** Envia uma ação de atribuição. A rota também marca a conversa como resolvida quando a ação é "resolver". */
export async function enviarAtribuicao(slug: string, corpo: CorpoAtribuicao, rotas: RotasPainel): Promise<void> {
  // Sessão vencida (ou conta desativada) na área da equipe leva ao login, como as outras rotas da conversa.
  const res = checarSessao(
    await fetch(ROTA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...corpo }),
    }),
    rotas,
  );
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
  if (!res.ok || !data.ok) throw new Error("falha");
}

/**
 * Responsável e departamento da conversa aberta: chips, trocar departamento, assumir,
 * soltar e delegar (a uma pessoa, com departamento opcional). Sem responsável, mostra
 * quem atendeu por último. Cada ação recarrega a página para mostrar o estado novo.
 */
export function AtribuicaoConversa({ slug, eu, inicial, departamentos, equipe, ultimoAtendimento }: AtribuicaoConversaProps) {
  const router = useRouter();
  const rotas = useRotas();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [delegando, setDelegando] = useState(false);
  const [paraDelegar, setParaDelegar] = useState("");
  const [deptoDelegar, setDeptoDelegar] = useState("");

  const executar = async (corpo: CorpoAtribuicao) => {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      await enviarAtribuicao(slug, corpo, rotas);
      setDelegando(false);
      router.refresh();
    } catch {
      setErro("Não foi possível salvar. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  };

  const meu = inicial.responsavel === eu;
  const livre = inicial.responsavel === null;
  const nomeResponsavel = meu ? "você" : (inicial.responsavelNome ?? inicial.responsavel);

  return (
    <div className="flex flex-col gap-2 border-b border-line bg-surface px-5 py-2 text-[12.5px] text-fg-dim max-[860px]:px-3">
      <div className="flex flex-wrap items-center gap-2">
        {inicial.departamentoNome ? (
          <span
            title={inicial.departamentoSugerido ? "Departamento sugerido pela IA; confirme ou troque" : "Departamento da conversa"}
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-2 px-1.5 py-[3px] text-fg"
          >
            {inicial.departamentoNome}
            {inicial.departamentoSugerido && <span className="whitespace-nowrap text-id-ia">sugerido pela IA</span>}
          </span>
        ) : (
          <span className="text-fg-faint">sem departamento</span>
        )}
        {departamentos.length > 0 && (
          <Select
            tamanho="sm"
            aria-label="Trocar departamento"
            disabled={ocupado}
            value={inicial.departamento ?? ""}
            onChange={(e) => void executar({ acao: "departamento", departamento: e.target.value || null })}
          >
            <option value="">Sem departamento</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </Select>
        )}

        <span className="inline-flex items-center gap-1.5">
          <Icone nome={livre ? "clock" : "user"} tamanho={13} className="text-fg-faint" />
          {livre ? (
            <>
              Sem responsável
              {ultimoAtendimento?.atendente && <span className="text-fg-faint"> · último atendimento: {ultimoAtendimento.atendente}</span>}
            </>
          ) : (
            <>Com {nomeResponsavel}</>
          )}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          {livre && (
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void executar({ acao: "assumir" })}>
              Assumir
            </Button>
          )}
          {meu && (
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void executar({ acao: "soltar" })}>
              Soltar
            </Button>
          )}
          {equipe.length > 0 && (
            <Button size="sm" variant="ghost" aria-expanded={delegando} onClick={() => setDelegando((v) => !v)} disabled={ocupado}>
              Delegar
            </Button>
          )}
        </div>
      </div>

      {delegando && (
        <div className={cn("flex flex-wrap items-center gap-2 rounded-control border border-line-2 bg-surface-2 p-2")}>
          <Select tamanho="sm" aria-label="Delegar para" value={paraDelegar} onChange={(e) => setParaDelegar(e.target.value)}>
            <option value="">Escolha a pessoa</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
          {departamentos.length > 0 && (
            <Select tamanho="sm" aria-label="Departamento na delegação" value={deptoDelegar} onChange={(e) => setDeptoDelegar(e.target.value)}>
              <option value="">Manter o departamento</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Select>
          )}
          <Button
            size="sm"
            disabled={!paraDelegar || ocupado}
            onClick={() =>
              void executar({
                acao: "delegar",
                para: paraDelegar,
                ...(deptoDelegar ? { departamento: deptoDelegar } : {}),
              })
            }
          >
            Delegar
          </Button>
        </div>
      )}

      {erro && (
        <span role="alert" className="text-danger">
          {erro}
        </span>
      )}
    </div>
  );
}
