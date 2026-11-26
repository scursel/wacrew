"use client";

import { useEffect, useState } from "react";
import { pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Badge, Button, Card, Field, Icone, Input, Select } from "@/app/components/ui";
import type { GatilhoAutomacao, RegraAutomacao } from "@/lib/automacoes";
import { Carregando, FalhaAoCarregar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

const LABEL_GATILHO: Record<GatilhoAutomacao, string> = {
  mensagem_recebida: "Quando receber mensagem",
  fora_do_expediente: "Mensagem fora do expediente",
  sem_resposta_minutos: "Cliente sem resposta (min)",
};

export function AutomacoesCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar, definir } = useCarregar<{ regras: RegraAutomacao[] }>("/api/automacoes");
  const [nome, setNome] = useState("");
  const [gatilho, setGatilho] = useState<GatilhoAutomacao>("mensagem_recebida");
  const [contemTexto, setContemTexto] = useState("");
  const [apenasDm, setApenasDm] = useState(false);
  const [minutosSemResposta, setMinutosSemResposta] = useState("15");
  const [addTag, setAddTag] = useState("");
  const [setDep, setSetDep] = useState("");
  const [setAgente, setSetAgente] = useState("");
  const [notaInterna, setNotaInterna] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msgErro, setMsgErro] = useState<string | null>(null);

  const regras = dados?.regras ?? [];

  useEffect(() => {
    if (!dados) return;
    const ativas = dados.regras.filter((r) => r.ativo).length;
    aoResumir("automacoes", { texto: `${ativas}/${dados.regras.length}`, tom: ativas > 0 ? "ok" : undefined });
  }, [dados, aoResumir]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    setMsgErro(null);
    try {
      const res = await pedirJson<{ ok: boolean; regra: RegraAutomacao }>("/api/automacoes", {
        corpo: {
          nome: nome.trim(),
          ativo: true,
          gatilho,
          condicoes: {
            ...(contemTexto.trim() ? { contemTexto: contemTexto.trim() } : {}),
            ...(apenasDm ? { apenasDm: true } : {}),
            ...(gatilho === "sem_resposta_minutos" ? { minutosSemResposta: Math.max(1, Number(minutosSemResposta) || 15) } : {}),
          },
          acoes: {
            ...(addTag.trim() ? { adicionarEtiqueta: addTag.trim() } : {}),
            ...(setDep.trim() ? { definirDepartamento: setDep.trim() } : {}),
            ...(setAgente.trim() ? { atribuirAgente: setAgente.trim() } : {}),
            ...(notaInterna.trim() ? { criarNotaInterna: notaInterna.trim() } : {}),
          },
        },
      });
      definir((prev) => ({ regras: [...(prev?.regras ?? []), res.regra] }));
      setNome("");
      setContemTexto("");
      setAddTag("");
      setSetDep("");
      setSetAgente("");
      setNotaInterna("");
    } catch (err) {
      setMsgErro(err instanceof Error ? err.message : "Erro ao criar regra");
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(r: RegraAutomacao) {
    const res = await pedirJson<{ ok: boolean; regra: RegraAutomacao }>("/api/automacoes", {
      corpo: { ...r, ativo: !r.ativo },
    }).catch(() => null);
    if (res?.regra) {
      definir((prev) => ({ regras: (prev?.regras ?? []).map((x) => (x.id === r.id ? res.regra : x)) }));
    }
  }

  async function remover(id: string) {
    const res = await fetch(`/api/automacoes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      definir((prev) => ({ regras: (prev?.regras ?? []).filter((x) => x.id !== id) }));
    }
  }

  return (
    <Card
      id="automacoes"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Automações"
      icone={<Icone nome="spark" />}
    >
      <p className="mb-3 text-[12.5px] text-fg-dim">
        Regras por gatilho e condições para etiquetar, rotear ou registrar notas internas automaticamente.
      </p>
      {erro && <FalhaAoCarregar erro={erro} aoTentar={recarregar} />}
      {!dados && !erro && <Carregando />}
      {dados && (
        <div className="space-y-4">
          {regras.length === 0 ? (
            <p className="text-[13px] text-fg-faint">Nenhuma regra configurada ainda.</p>
          ) : (
            <ul className="divide-y divide-line rounded-control border border-line bg-surface-2">
              {regras.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <strong className="font-semibold text-fg">{r.nome}</strong>
                      <Badge variant={r.ativo ? "ok" : "neutral"}>{r.ativo ? "Ativa" : "Pausada"}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-fg-dim">
                      {LABEL_GATILHO[r.gatilho]}
                      {r.condicoes.contemTexto ? ` · texto="${r.condicoes.contemTexto}"` : ""}
                      {r.condicoes.apenasDm ? " · só DM" : ""}
                      {r.acoes.adicionarEtiqueta ? ` → +etiqueta "${r.acoes.adicionarEtiqueta}"` : ""}
                      {r.acoes.definirDepartamento ? ` → depto ${r.acoes.definirDepartamento}` : ""}
                      {r.acoes.atribuirAgente ? ` → @${r.acoes.atribuirAgente}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" size="sm" variant="subtle" onClick={() => void alternar(r)}>
                      {r.ativo ? "Pausar" : "Ativar"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void remover(r.id)}>
                      Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={(e) => void criar(e)} className="grid gap-3 rounded-control border border-line bg-surface-2 p-3.5 sm:grid-cols-2">
            <Field label="Nome da regra" htmlFor="auto-nome">
              <Input id="auto-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Orçamento urgente" required />
            </Field>
            <Field label="Gatilho" htmlFor="auto-gat">
              <Select id="auto-gat" value={gatilho} onChange={(e) => setGatilho(e.target.value as GatilhoAutomacao)}>
                <option value="mensagem_recebida">Quando receber mensagem</option>
                <option value="fora_do_expediente">Fora do expediente</option>
                <option value="sem_resposta_minutos">Cliente sem resposta (min)</option>
              </Select>
            </Field>
            <Field label="Condição: contém texto (opcional)" htmlFor="auto-txt">
              <Input id="auto-txt" value={contemTexto} onChange={(e) => setContemTexto(e.target.value)} placeholder="Ex.: orçamento, boleto, urgente" />
            </Field>
            {gatilho === "sem_resposta_minutos" ? (
              <Field label="Minutos sem resposta" htmlFor="auto-min">
                <Input id="auto-min" type="number" min={1} value={minutosSemResposta} onChange={(e) => setMinutosSemResposta(e.target.value)} />
              </Field>
            ) : (
              <div className="flex items-end pb-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg">
                  <input type="checkbox" checked={apenasDm} onChange={(e) => setApenasDm(e.target.checked)} />
                  Aplicar apenas em conversas diretas (DM)
                </label>
              </div>
            )}
            <Field label="Ação: adicionar etiqueta (opcional)" htmlFor="auto-tag">
              <Input id="auto-tag" value={addTag} onChange={(e) => setAddTag(e.target.value)} placeholder="Ex.: Urgente" />
            </Field>
            <Field label="Ação: ID do departamento (opcional)" htmlFor="auto-dep">
              <Input id="auto-dep" value={setDep} onChange={(e) => setSetDep(e.target.value)} placeholder="Ex.: oficina" />
            </Field>
            <Field label="Ação: atribuir ao login (opcional)" htmlFor="auto-ag">
              <Input id="auto-ag" value={setAgente} onChange={(e) => setSetAgente(e.target.value)} placeholder="Ex.: maria" />
            </Field>
            <Field label="Ação: criar nota privada (opcional)" htmlFor="auto-nota">
              <Input id="auto-nota" value={notaInterna} onChange={(e) => setNotaInterna(e.target.value)} placeholder="Ex.: SLA prioritário ativado" />
            </Field>
            {msgErro && <p className="text-[12.5px] text-danger sm:col-span-2">{msgErro}</p>}
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" size="sm" loading={salvando} disabled={!nome.trim()}>
                Adicionar automação
              </Button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
