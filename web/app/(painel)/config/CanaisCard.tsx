"use client";

import { useEffect, useState } from "react";
import { pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Badge, Button, Card, Field, Icone, Input } from "@/app/components/ui";
import { Carregando, FalhaAoCarregar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

interface CanalView {
  id: string;
  nome: string;
  numero?: string;
  controlUrl: string;
  hasToken: boolean;
  departamentoPadrao?: string;
  padrao?: boolean;
  ativo: boolean;
}

/**
 * Gestão de múltiplos chips/coletores (opcional — avançado).
 * Quem usa só 1 WhatsApp não precisa preencher nada aqui; o formulário extra fica recolhido por padrão.
 */
export function CanaisCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar, definir } = useCarregar<{ inboxes: CanalView[] }>("/api/inboxes");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [controlUrl, setControlUrl] = useState("");
  const [controlToken, setControlToken] = useState("");
  const [depto, setDepto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [testandoId, setTestandoId] = useState<string | null>(null);
  const [statusTexto, setStatusTexto] = useState<string | null>(null);

  const inboxes = dados?.inboxes ?? [];

  useEffect(() => {
    if (!dados) return;
    const ativos = dados.inboxes.filter((i) => i.ativo).length;
    aoResumir("canais", { texto: `${ativos} ${ativos === 1 ? "chip" : "chips"}`, tom: ativos > 1 ? "ok" : undefined });
  }, [dados, aoResumir]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !controlUrl.trim() || salvando) return;
    setSalvando(true);
    setStatusTexto(null);
    try {
      const res = await pedirJson<{ ok: boolean; inbox: CanalView }>("/api/inboxes", {
        corpo: {
          nome: nome.trim(),
          controlUrl: controlUrl.trim(),
          ...(numero.trim() ? { numero: numero.trim() } : {}),
          ...(controlToken.trim() ? { controlToken: controlToken.trim() } : {}),
          ...(depto.trim() ? { departamentoPadrao: depto.trim() } : {}),
        },
      });
      definir((prev) => ({ inboxes: [...(prev?.inboxes ?? []), res.inbox] }));
      setNome("");
      setNumero("");
      setControlUrl("");
      setControlToken("");
      setDepto("");
      setMostrarForm(false);
      setStatusTexto("Chip extra adicionado.");
    } catch (err) {
      setStatusTexto(err instanceof Error ? err.message : "Erro ao salvar chip.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar(id: string) {
    setTestandoId(id);
    setStatusTexto(null);
    try {
      const res = await pedirJson<{ ok: boolean; status?: string; erro?: string }>("/api/inboxes", {
        corpo: { acao: "testar", id },
      });
      setStatusTexto(
        res.ok
          ? `Coletor "${id}" respondeu OK (${res.status ?? "online"}).`
          : `Coletor "${id}" não respondeu: ${res.erro ?? "sem resposta"}.`,
      );
    } catch (err) {
      setStatusTexto(err instanceof Error ? err.message : "Falha ao testar coletor.");
    } finally {
      setTestandoId(null);
    }
  }

  async function remover(id: string) {
    const res = await fetch(`/api/inboxes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      definir((prev) => ({ inboxes: (prev?.inboxes ?? []).filter((i) => i.id !== id) }));
      setStatusTexto("Chip removido.");
    }
  }

  return (
    <Card
      id="canais"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Outros chips (Multi-chip)"
      icone={<Icone nome="phone" />}
      acoes={
        dados ? (
          <Button type="button" size="sm" variant="subtle" onClick={() => setMostrarForm((v) => !v)}>
            <Icone nome={mostrarForm ? "x" : "plus"} tamanho={14} />
            {mostrarForm ? "Cancelar" : "Conectar chip extra"}
          </Button>
        ) : undefined
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-dim">
        Seu WhatsApp principal já funciona automaticamente pela seção{" "}
        <a href="#conexao" className="font-medium text-accent hover:underline">
          Conexão
        </a>
        . Só use esta área se quiser ligar um <strong className="font-medium text-fg">segundo número de WhatsApp</strong>{" "}
        rodando em outra instância do coletor.
      </p>

      {erro && <FalhaAoCarregar erro={erro} aoTentar={recarregar} />}
      {!dados && !erro && <Carregando linhas={2} />}
      {dados && (
        <div className="space-y-4">
          <ul className="divide-y divide-line rounded-control border border-line bg-surface-2">
            {inboxes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="font-semibold text-fg">{c.nome}</strong>
                    {c.padrao && <Badge variant="ok">Principal</Badge>}
                    {c.numero && <span className="font-mono text-[12px] text-fg-dim">{c.numero}</span>}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11.5px] text-fg-faint">
                    {c.padrao ? "Coletor interno deste servidor" : c.controlUrl}
                    {c.departamentoPadrao ? ` · depto padrão: ${c.departamentoPadrao}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button type="button" size="sm" variant="subtle" loading={testandoId === c.id} onClick={() => void testar(c.id)}>
                    Testar
                  </Button>
                  {!c.padrao && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void remover(c.id)}>
                      Remover
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {statusTexto && <p className="text-[12.5px] text-fg-dim">{statusTexto}</p>}

          {mostrarForm && (
            <form onSubmit={(e) => void adicionar(e)} className="grid gap-3 rounded-control border border-line bg-surface-2 p-3.5 sm:grid-cols-2">
              <p className="text-[12px] leading-relaxed text-fg-dim sm:col-span-2">
                Preencha apenas se você subiu uma segunda instância do coletor WACrew para outro número de WhatsApp.
              </p>
              <Field label="Apelido deste chip" htmlFor="canal-nome" hint="Nome para identificar o número no painel.">
                <Input id="canal-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Chip Pós-venda" required />
              </Field>
              <Field label="Número do WhatsApp (opcional)" htmlFor="canal-num">
                <Input id="canal-num" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="+55 11 99999-0000" />
              </Field>
              <Field label="URL do coletor extra" htmlFor="canal-url" hint="Endereço HTTP da Control API desse outro coletor.">
                <Input id="canal-url" value={controlUrl} onChange={(e) => setControlUrl(e.target.value)} placeholder="http://127.0.0.1:4311" required />
              </Field>
              <Field label="Token de segurança (opcional)" htmlFor="canal-tok">
                <Input id="canal-tok" type="password" value={controlToken} onChange={(e) => setControlToken(e.target.value)} />
              </Field>
              <Field label="Departamento padrão (opcional)" htmlFor="canal-dep" className="sm:col-span-2">
                <Input id="canal-dep" value={depto} onChange={(e) => setDepto(e.target.value)} placeholder="Ex.: comercial" />
              </Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setMostrarForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" loading={salvando} disabled={!nome.trim() || !controlUrl.trim()}>
                  Adicionar chip
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
