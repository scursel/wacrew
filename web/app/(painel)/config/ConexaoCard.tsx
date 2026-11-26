"use client";

import QRCode from "qrcode";
import { type ReactNode, useEffect, useState } from "react";
import { Badge, Button, Card, Icone, Input, Segmentado } from "@/app/components/ui";
import type { CollectorStatus } from "@/lib/config";
import { ANCORA_CARD, type AoResumir, type Resumo } from "./secoes";

type Conn = CollectorStatus["connection"];

/** Selo do cabeçalho, estado curto da navegação e tom de cada estado. */
const ESTADOS: Record<Conn, { selo: string; curto: string; badge: "ok" | "accent" | "danger" | "neutral"; tom?: Resumo["tom"] }> = {
  open: { selo: "Conectado", curto: "conectado", badge: "ok", tom: "ok" },
  connecting: { selo: "Conectando", curto: "conectando", badge: "accent", tom: "accent" },
  qr: { selo: "Aguardando o QR", curto: "QR", badge: "accent", tom: "accent" },
  close: { selo: "Desconectado", curto: "desconectado", badge: "danger", tom: "danger" },
  logged_out: { selo: "Sessão encerrada", curto: "sessão caiu", badge: "danger", tom: "danger" },
  unknown: { selo: "Sem estado", curto: "sem estado", badge: "neutral" },
  offline: { selo: "Coletor offline", curto: "offline", badge: "neutral" },
};

function explicacao(conn: Conn, status: CollectorStatus | null): ReactNode {
  switch (conn) {
    case "open": {
      const n = status?.watchedCount ?? 0;
      return (
        <>
          Monitorando <span className="font-mono tabular-nums text-fg">{n}</span> {n === 1 ? "grupo" : "grupos"}.
        </>
      );
    }
    case "connecting":
      return "Conectando ao WhatsApp…";
    case "close":
      return "A conexão caiu. Com o coletor rodando, ele tenta reconectar sozinho.";
    case "logged_out":
      return "A sessão foi encerrada no celular. Um QR novo aparece aqui em instantes para conectar de novo.";
    case "unknown":
      return "O coletor ainda não informou o estado da conexão.";
    case "offline":
      return (
        <>
          O coletor não está rodando. Inicie com{" "}
          <code className="rounded-tag bg-elevated px-1.5 py-0.5 font-mono text-[12.5px] text-fg">npm run dev</code> na raiz do
          projeto.
        </>
      );
    default:
      return null;
  }
}

/** Conexão do coletor com o WhatsApp: estado ao vivo (a cada 2,5 s) e o QR quando é preciso parear. */
export function ConexaoCard({ aoResumir }: { aoResumir: AoResumir }) {
  const [status, setStatus] = useState<CollectorStatus | null>(null);

  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const dados = (await res.json()) as CollectorStatus;
        if (vivo) setStatus(dados);
      } catch {
        /* coletor pode estar fora do ar: segue mostrando o último estado */
      }
    };
    void ler();
    const id = setInterval(ler, 2500);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  const conn = status?.connection ?? "offline";
  const estado = ESTADOS[conn];

  useEffect(() => {
    aoResumir("conexao", { texto: estado.curto, tom: estado.tom });
  }, [aoResumir, estado]);

  return (
    <Card
      id="conexao"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Conexão com o WhatsApp"
      icone={<Icone nome="phone" />}
      acoes={
        <Badge variant={estado.badge} dot>
          {estado.selo}
        </Badge>
      }
    >
      {conn === "qr" && (status?.qr || status?.pairingCode) ? (
        <Pareamento qr={status.qr ?? ""} pairingCode={status.pairingCode ?? null} />
      ) : (
        <p className="text-[13.5px] leading-relaxed text-fg-dim">{explicacao(conn, status)}</p>
      )}
    </Card>
  );
}

type ModoPareamento = "qr" | "numero";

const PASSOS_QR = [
  "No celular, abra o WhatsApp.",
  "Toque em Aparelhos conectados › Conectar um aparelho.",
  "Aponte a câmera para este código.",
];

const PASSOS_NUMERO = [
  "No celular, abra o WhatsApp.",
  "Toque em Aparelhos conectados › Conectar um aparelho › Conectar com número de telefone.",
  "Digite o código de 8 caracteres abaixo no celular.",
];

function formatarCodigoPareamento(code: string): string {
  const limpo = code.replace(/[^a-zA-Z0-9]/g, "");
  return limpo.length === 8 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : code;
}

function Pareamento({ qr, pairingCode }: { qr: string; pairingCode: string | null }) {
  const [modo, setModo] = useState<ModoPareamento>("qr");
  const [src, setSrc] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [codigoGerado, setCodigoGerado] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const codigoVisivel = codigoGerado ?? pairingCode;

  useEffect(() => {
    if (!qr) {
      setSrc(null);
      return;
    }
    QRCode.toDataURL(qr, { width: 232, margin: 2 })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [qr]);

  async function gerarCodigo(e: React.FormEvent) {
    e.preventDefault();
    const digits = numero.replace(/\D/g, "");
    if (!digits) {
      setErro("Informe o número com DDI (ex.: 5511999999999).");
      return;
    }
    setGerando(true);
    setErro(null);
    setCopiado(false);
    try {
      const res = await fetch("/api/pair-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: digits }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
      if (!res.ok || !data.ok || !data.code) {
        setErro(data.error ?? "Não foi possível gerar o código.");
        return;
      }
      setCodigoGerado(data.code);
    } catch {
      setErro("Falha de comunicação com o painel.");
    } finally {
      setGerando(false);
    }
  }

  async function copiarCodigo() {
    if (!codigoVisivel) return;
    try {
      await navigator.clipboard.writeText(codigoVisivel);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard bloqueado pelo navegador */
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Segmentado
        rotulo="Modo de pareamento"
        valor={modo}
        aoMudar={setModo}
        opcoes={[
          { valor: "qr", rotulo: "QR code" },
          { valor: "numero", rotulo: "Conectar com número" },
        ]}
      />

      {modo === "qr" ? (
        <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
          <div className="grid h-[232px] w-[232px] shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-surface-2">
            {src ? (
              // biome-ignore lint/performance/noImgElement: data URL local, next/image não cabe
              <img src={src} alt="QR code para conectar o WhatsApp" width={232} height={232} />
            ) : (
              <span className="text-[12.5px] text-fg-faint">Gerando o QR…</span>
            )}
          </div>
          <div className="min-w-[220px] flex-1">
            <ol className="flex flex-col gap-3">
              {PASSOS_QR.map((passo, i) => (
                <li key={passo} className="flex items-start gap-3 text-[13.5px] text-fg">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-elevated font-mono text-[12px] text-fg-dim">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{passo}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 max-w-[52ch] text-[12.5px] leading-relaxed text-fg-faint">
              Use o celular do número que este painel atende. O código se renova sozinho; deixe esta tela aberta até aparecer
              Conectado.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
          <div className="min-w-[260px] max-w-sm flex-1 space-y-4">
            <form onSubmit={(e) => void gerarCodigo(e)} className="flex flex-col gap-2.5">
              <label htmlFor="pair-number-input" className="text-[12.5px] font-medium text-fg-dim">
                Número do WhatsApp com DDI
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="pair-number-input"
                  value={numero}
                  onChange={(e) => {
                    setNumero(e.target.value);
                    setErro(null);
                  }}
                  placeholder="5511999999999"
                  inputMode="tel"
                  autoComplete="off"
                  className="font-mono"
                />
                <Button type="submit" size="sm" loading={gerando}>
                  Gerar código
                </Button>
              </div>
              {erro && <p className="text-[12.5px] text-danger">{erro}</p>}
            </form>

            {codigoVisivel && (
              <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-2 px-4 py-3">
                <span className="font-mono text-xl font-semibold tracking-[0.14em] text-fg">
                  {formatarCodigoPareamento(codigoVisivel)}
                </span>
                <Button type="button" variant="subtle" size="sm" onClick={() => void copiarCodigo()}>
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
              </div>
            )}
          </div>

          <div className="min-w-[220px] flex-1">
            <ol className="flex flex-col gap-3">
              {PASSOS_NUMERO.map((passo, i) => (
                <li key={passo} className="flex items-start gap-3 text-[13.5px] text-fg">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-elevated font-mono text-[12px] text-fg-dim">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{passo}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 max-w-[52ch] text-[12.5px] leading-relaxed text-fg-faint">
              Use o mesmo número do celular que vai atender este painel. Deixe esta tela aberta até aparecer Conectado.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
