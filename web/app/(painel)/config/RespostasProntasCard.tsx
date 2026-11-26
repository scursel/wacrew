"use client";

import { useEffect, useState } from "react";
import { mensagemDe, pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Aviso, Button, Card, EmptyState, Field, IconButton, Icone, Input, Textarea } from "@/app/components/ui";
import type { RespostaPronta } from "@/lib/respostas-prontas";
import { Carregando, FalhaAoCarregar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

/** CRUD de respostas prontas (/atalho) com variáveis {{nome}}, {{atendente}} e {{departamento}}. */
export function RespostasProntasCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar, definir } = useCarregar<RespostaPronta[]>("/api/respostas-prontas");
  const [editId, setEditId] = useState<string | null>(null);
  const [atalho, setAtalho] = useState("");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  useEffect(() => {
    if (dados) aoResumir("respostas", { texto: String(dados.length) });
  }, [aoResumir, dados]);

  function limparForm() {
    setEditId(null);
    setAtalho("");
    setTitulo("");
    setTexto("");
    setErroAcao(null);
  }

  function editar(item: RespostaPronta) {
    setEditId(item.id);
    setAtalho(item.atalho);
    setTitulo(item.titulo);
    setTexto(item.texto);
    setErroAcao(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErroAcao(null);
    try {
      const res = await pedirJson<{ ok: boolean; itens: RespostaPronta[] }>("/api/respostas-prontas", {
        corpo: { ...(editId ? { id: editId } : {}), atalho, titulo, texto },
      });
      definir(res.itens);
      limparForm();
    } catch (err) {
      setErroAcao(mensagemDe(err));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    setErroAcao(null);
    try {
      const res = await fetch(`/api/respostas-prontas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; itens?: RespostaPronta[]; error?: string };
      if (!res.ok || !data.itens) throw new Error(data.error ?? "falha ao remover");
      definir(data.itens);
      if (editId === id) limparForm();
    } catch (err) {
      setErroAcao(mensagemDe(err));
    }
  }

  return (
    <Card
      id="respostas"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Respostas prontas"
      icone={<Icone nome="chat" />}
      rodape={
        <span className="text-[12.5px] text-fg-faint">
          Digite <code className="rounded-tag bg-elevated px-1.5 py-0.5 font-mono text-fg">/atalho</code> no compositor. Variáveis:{" "}
          <code className="font-mono text-fg">{"{{nome}}"}</code>, <code className="font-mono text-fg">{"{{atendente}}"}</code>,{" "}
          <code className="font-mono text-fg">{"{{departamento}}"}</code>.
        </span>
      }
    >
      {erro ? (
        <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />
      ) : !dados ? (
        <Carregando linhas={3} rotulo="Carregando respostas prontas…" />
      ) : (
        <div className="space-y-5">
          {erroAcao && (
            <Aviso tom="erro" aoFechar={() => setErroAcao(null)}>
              {erroAcao}
            </Aviso>
          )}

          <form onSubmit={(e) => void salvar(e)} className="grid gap-3 rounded-card border border-line bg-surface-2 p-4 sm:grid-cols-2">
            <Field label="Atalho (sem /)" htmlFor="rp-atalho">
              <Input
                id="rp-atalho"
                value={atalho}
                onChange={(e) => setAtalho(e.target.value)}
                placeholder="ex.: boas-vindas"
                className="font-mono"
              />
            </Field>
            <Field label="Título" htmlFor="rp-titulo">
              <Input
                id="rp-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="ex.: Saudação inicial"
              />
            </Field>
            <Field label="Texto da mensagem" htmlFor="rp-texto" className="sm:col-span-2">
              <Textarea
                id="rp-texto"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                placeholder="Olá {{nome}}, aqui é {{atendente}} do setor {{departamento}}. Como posso ajudar?"
              />
            </Field>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit" size="sm" loading={salvando}>
                {editId ? "Salvar alteração" : "Adicionar resposta"}
              </Button>
              {editId && (
                <Button type="button" variant="ghost" size="sm" onClick={limparForm}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>

          {dados.length === 0 ? (
            <EmptyState
              title="Nenhuma resposta pronta"
              description="Crie atalhos acima para responder rapidamente digitando / na conversa."
            />
          ) : (
            <ul className="divide-y divide-line rounded-card border border-line">
              {dados.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded-tag bg-elevated px-2 py-0.5 font-mono text-[12px] font-medium text-accent">
                        /{item.atalho}
                      </code>
                      <span className="text-[13.5px] font-medium text-fg">{item.titulo}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg-dim">{item.texto}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => editar(item)}>
                      Editar
                    </Button>
                    <IconButton
                      size="sm"
                      aria-label={`Remover /${item.atalho}`}
                      title="Remover"
                      onClick={() => void remover(item.id)}
                    >
                      <Icone nome="x" tamanho={14} />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
