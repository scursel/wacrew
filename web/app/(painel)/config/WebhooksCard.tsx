"use client";

import { useEffect, useState } from "react";
import { pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Badge, Button, Card, Field, Icone, Input } from "@/app/components/ui";
import type { EventoWebhook, WebhookConfig } from "@/lib/webhooks";
import { Carregando, FalhaAoCarregar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

const EVENTOS: Array<{ id: EventoWebhook; rotulo: string }> = [
  { id: "message.received", rotulo: "message.received (recebida)" },
  { id: "message.sent", rotulo: "message.sent (enviada)" },
  { id: "conversation.resolved", rotulo: "conversation.resolved" },
  { id: "conversation.assigned", rotulo: "conversation.assigned" },
  { id: "csat.submitted", rotulo: "csat.submitted" },
];

type WebhookView = WebhookConfig & { secretPreview?: string };

export function WebhooksCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar, definir } = useCarregar<{ webhooks: WebhookView[] }>("/api/webhooks");
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [eventos, setEventos] = useState<EventoWebhook[]>(["message.received", "conversation.resolved"]);
  const [salvando, setSalvando] = useState(false);
  const [testandoId, setTestandoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const hooks = dados?.webhooks ?? [];

  useEffect(() => {
    if (!dados) return;
    const ativos = dados.webhooks.filter((w) => w.ativo).length;
    aoResumir("webhooks", { texto: `${ativos}/${dados.webhooks.length}`, tom: ativos > 0 ? "ok" : undefined });
  }, [dados, aoResumir]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !url.trim() || eventos.length === 0 || salvando) return;
    setSalvando(true);
    setFeedback(null);
    try {
      const res = await pedirJson<{ ok: boolean; webhook: WebhookView }>("/api/webhooks", {
        corpo: { nome: nome.trim(), url: url.trim(), ...(secret.trim() ? { secret: secret.trim() } : {}), eventos, ativo: true },
      });
      definir((prev) => ({ webhooks: [...(prev?.webhooks ?? []), res.webhook] }));
      setNome("");
      setUrl("");
      setSecret("");
      setFeedback("Webhook salvo com sucesso.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Falha ao salvar webhook.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar(id: string) {
    setTestandoId(id);
    setFeedback(null);
    try {
      const res = await pedirJson<{ ok: boolean }>("/api/webhooks", { corpo: { acao: "testar", id } });
      setFeedback(res.ok ? "Disparo de teste entregue (HTTP 2xx)." : "Endpoint respondeu sem sucesso (não-2xx ou timeout).");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erro ao testar webhook.");
    } finally {
      setTestandoId(null);
    }
  }

  async function remover(id: string) {
    const res = await fetch(`/api/webhooks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      definir((prev) => ({ webhooks: (prev?.webhooks ?? []).filter((w) => w.id !== id) }));
    }
  }

  function toggleEvento(ev: EventoWebhook) {
    setEventos((cur) => (cur.includes(ev) ? cur.filter((x) => x !== ev) : [...cur, ev]));
  }

  return (
    <Card
      id="webhooks"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Webhooks (n8n, Make, CRM)"
      icone={<Icone nome="link" />}
    >
      <p className="mb-3 text-[12.5px] text-fg-dim">
        Dispara eventos assinados com HMAC-SHA256 (X-Wacrew-Signature-256) para integrações externas.
      </p>
      {erro && <FalhaAoCarregar erro={erro} aoTentar={recarregar} />}
      {!dados && !erro && <Carregando />}
      {dados && (
        <div className="space-y-4">
          {hooks.length === 0 ? (
            <p className="text-[13px] text-fg-faint">Nenhum webhook cadastrado ainda.</p>
          ) : (
            <ul className="divide-y divide-line rounded-control border border-line bg-surface-2">
              {hooks.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <strong className="font-semibold text-fg">{w.nome}</strong>
                      <Badge variant={w.ativo ? "ok" : "neutral"}>{w.ativo ? "Ativo" : "Inativo"}</Badge>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[12px] text-fg-dim">{w.url}</p>
                    <p className="mt-0.5 text-[11.5px] text-fg-faint">
                      Eventos: {w.eventos.join(", ")} · Segredo: <code>{w.secretPreview ?? w.secret.slice(0, 6)}</code>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" size="sm" variant="subtle" loading={testandoId === w.id} onClick={() => void testar(w.id)}>
                      Testar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void remover(w.id)}>
                      Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {feedback && <p className="text-[12.5px] text-fg-dim">{feedback}</p>}

          <form onSubmit={(e) => void adicionar(e)} className="grid gap-3 rounded-control border border-line bg-surface-2 p-3.5 sm:grid-cols-2">
            <Field label="Nome da integração" htmlFor="wh-nome">
              <Input id="wh-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: n8n Oficina" required />
            </Field>
            <Field label="URL do endpoint" htmlFor="wh-url">
              <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://meu-n8n.exemplo.com/webhook/wacrew" required />
            </Field>
            <Field label="Segredo HMAC (opcional — gerado automático se vazio)" htmlFor="wh-sec" className="sm:col-span-2">
              <Input id="wh-sec" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="segredo-compartilhado" />
            </Field>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-[12px] font-medium text-fg-dim">Eventos inscritos</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {EVENTOS.map((ev) => (
                  <label key={ev.id} className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-fg">
                    <input type="checkbox" checked={eventos.includes(ev.id)} onChange={() => toggleEvento(ev.id)} />
                    <code>{ev.rotulo}</code>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" size="sm" loading={salvando} disabled={!nome.trim() || !url.trim() || eventos.length === 0}>
                Adicionar webhook
              </Button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
