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

function base64ParaUint8Array(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function CanaisCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar, definir } = useCarregar<{ inboxes: CanalView[] }>("/api/inboxes");
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [controlUrl, setControlUrl] = useState("");
  const [controlToken, setControlToken] = useState("");
  const [depto, setDepto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [statusTexto, setStatusTexto] = useState<string | null>(null);
  const [pushInfo, setPushInfo] = useState<string | null>(null);

  const inboxes = dados?.inboxes ?? [];

  useEffect(() => {
    if (!dados) return;
    const ativos = dados.inboxes.filter((i) => i.ativo).length;
    aoResumir("canais", { texto: `${ativos} ${ativos === 1 ? "canal" : "canais"}`, tom: ativos > 0 ? "ok" : undefined });
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
      setStatusTexto("Canal adicionado.");
    } catch (err) {
      setStatusTexto(err instanceof Error ? err.message : "Erro ao salvar canal.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar(id: string) {
    setStatusTexto(null);
    try {
      const res = await pedirJson<{ ok: boolean; status?: string; erro?: string }>("/api/inboxes", {
        corpo: { acao: "testar", id },
      });
      setStatusTexto(res.ok ? `Canal ${id}: conectado (${res.status ?? "online"}).` : `Canal ${id}: ${res.erro ?? "sem resposta"}.`);
    } catch (err) {
      setStatusTexto(err instanceof Error ? err.message : "Falha ao testar canal.");
    }
  }

  async function remover(id: string) {
    const res = await fetch(`/api/inboxes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      definir((prev) => ({ inboxes: (prev?.inboxes ?? []).filter((i) => i.id !== id) }));
    }
  }

  async function ativarWebPush() {
    setPushInfo(null);
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushInfo("Este navegador não suporta notificações Web Push.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushInfo("Permissão de notificações negada no navegador.");
        return;
      }
      const cfg = await fetch("/api/push", { cache: "no-store" }).then((r) => r.json()) as { vapidPublicKey?: string };
      if (!cfg.vapidPublicKey) {
        setPushInfo("Notificações locais liberadas (defina VAPID_PUBLIC_KEY no servidor para push em segundo plano).");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const appServerKey = base64ParaUint8Array(cfg.vapidPublicKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });
      const json = sub.toJSON();
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      setPushInfo("Notificações Web Push ativadas neste dispositivo.");
    } catch (err) {
      setPushInfo(err instanceof Error ? err.message : "Não foi possível ativar Web Push.");
    }
  }

  return (
    <Card
      id="canais"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Canais WhatsApp (Multi-chip) e PWA"
      icone={<Icone nome="phone" />}
    >
      <p className="mb-3 text-[12.5px] text-fg-dim">
        Conecte números/instâncias adicionais de coletor e ative notificações push no dispositivo.
      </p>
      {erro && <FalhaAoCarregar erro={erro} aoTentar={recarregar} />}
      {!dados && !erro && <Carregando />}
      {dados && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-[12.5px]">
            <span className="text-fg-dim">Notificações Push no navegador / PWA instalado</span>
            <Button type="button" size="sm" variant="subtle" onClick={() => void ativarWebPush()}>
              Ativar notificações push
            </Button>
          </div>
          {pushInfo && <p className="text-[12px] text-fg-dim">{pushInfo}</p>}

          <ul className="divide-y divide-line rounded-control border border-line bg-surface-2">
            {inboxes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="font-semibold text-fg">{c.nome}</strong>
                    {c.padrao && <Badge variant="ok">Principal</Badge>}
                    {c.numero && <span className="font-mono text-[12px] text-fg-dim">{c.numero}</span>}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11.5px] text-fg-faint">
                    {c.controlUrl}
                    {c.departamentoPadrao ? ` · depto padrão: ${c.departamentoPadrao}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button type="button" size="sm" variant="subtle" onClick={() => void testar(c.id)}>
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

          <form onSubmit={(e) => void adicionar(e)} className="grid gap-3 rounded-control border border-line bg-surface-2 p-3.5 sm:grid-cols-2">
            <Field label="Nome do canal" htmlFor="canal-nome">
              <Input id="canal-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Chip Oficina / Pós-venda" required />
            </Field>
            <Field label="Número (opcional)" htmlFor="canal-num">
              <Input id="canal-num" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="+55 11 99999-0000" />
            </Field>
            <Field label="URL do coletor (Control API)" htmlFor="canal-url">
              <Input id="canal-url" value={controlUrl} onChange={(e) => setControlUrl(e.target.value)} placeholder="http://127.0.0.1:4200" required />
            </Field>
            <Field label="Token Bearer (opcional)" htmlFor="canal-tok">
              <Input id="canal-tok" type="password" value={controlToken} onChange={(e) => setControlToken(e.target.value)} />
            </Field>
            <Field label="Departamento padrão (opcional)" htmlFor="canal-dep" className="sm:col-span-2">
              <Input id="canal-dep" value={depto} onChange={(e) => setDepto(e.target.value)} placeholder="Ex.: comercial" />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" size="sm" loading={salvando} disabled={!nome.trim() || !controlUrl.trim()}>
                Adicionar canal
              </Button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
