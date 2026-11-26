"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { iniciais } from "@/lib/aparencia";
import type { StatusDisponibilidade } from "@/lib/equipe/disponibilidade";
import type { NotificacaoInterna } from "@/lib/equipe/notificacoes-internas";
import { Button, Field, Icone, Input } from "./ui";
import { PontoDeConexao, useStatusColetor } from "./ConnectionDot";
import { useTema } from "./ThemeToggle";

const ITEM =
  "relative flex w-[60px] flex-col items-center gap-1 rounded-[10px] pb-1.5 pt-2 text-[11px] font-medium leading-none transition-colors " +
  "max-[860px]:w-auto max-[860px]:max-w-[96px] max-[860px]:flex-1";

const CHAVE_SOM = "wac-atend-som";

const COR_DISP: Record<StatusDisponibilidade, string> = {
  online: "bg-ok",
  ocupado: "bg-warn-mark",
  offline: "bg-fg-mute",
};

const LABEL_DISP: Record<StatusDisponibilidade, string> = {
  online: "Online",
  ocupado: "Ocupado",
  offline: "Offline",
};

function tocarAlertaSuave() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.19);
    setTimeout(() => void ctx.close().catch(() => {}), 300);
  } catch {
    /* áudio bloqueado */
  }
}

/**
 * Trilho da área da equipe: a mesma moldura do painel do dono, com Caixa,
 * disponibilidade, notificações internas, nova conversa, perfil, tema e sair.
 * No celular vira a barra de baixo.
 */
export function AtendimentoSidebar({ nome, naoLidas }: { nome: string; naoLidas: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const { open, pairing } = useStatusColetor();
  const { escuro, alternar } = useTema();
  const estado = open ? "conectado" : pairing ? "pareando" : "desconectado";
  const naCaixa = pathname === "/atendimento" || pathname.startsWith("/atendimento/");

  const [disp, setDisp] = useState<StatusDisponibilidade>("online");
  const [notifs, setNotifs] = useState<NotificacaoInterna[]>([]);
  const [notifAberto, setNotifAberto] = useState(false);
  const [somAtivo, setSomAtivo] = useState(false);
  const prevNaoLidasRef = useRef<number | null>(null);

  const [novaAberta, setNovaAberta] = useState(false);
  const [novaNumero, setNovaNumero] = useState("");
  const [novaTexto, setNovaTexto] = useState("");
  const [novaEnviando, setNovaEnviando] = useState(false);
  const [novaErro, setNovaErro] = useState<string | null>(null);

  const [perfilAberto, setPerfilAberto] = useState(false);
  const [perfilNome, setPerfilNome] = useState(nome);
  const [assinarMsgs, setAssinarMsgs] = useState(true);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [perfilSalvando, setPerfilSalvando] = useState(false);
  const [perfilFeedback, setPerfilFeedback] = useState<{ ok?: boolean; msg: string } | null>(null);

  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setSomAtivo(window.localStorage.getItem(CHAVE_SOM) === "1");
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/atendimento/disponibilidade", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { status?: StatusDisponibilidade } | null) => {
        if (alive && d?.status) setDisp(d.status);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const carregarNotifs = useCallback(async () => {
    try {
      const r = await fetch("/api/atendimento/notificacoes", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { itens?: NotificacaoInterna[] };
      if (!Array.isArray(d.itens)) return;
      const naoLidasAgora = d.itens.filter((n) => !n.lida).length;
      if (prevNaoLidasRef.current !== null && naoLidasAgora > prevNaoLidasRef.current && somAtivo) {
        tocarAlertaSuave();
      }
      prevNaoLidasRef.current = naoLidasAgora;
      setNotifs(d.itens);
    } catch {
      /* ignora erro transitório */
    }
  }, [somAtivo]);

  useEffect(() => {
    void carregarNotifs();
    const id = setInterval(() => void carregarNotifs(), 15_000);
    return () => clearInterval(id);
  }, [carregarNotifs]);

  useEffect(() => {
    if (!notifAberto) return;
    const fora = (e: PointerEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [notifAberto]);

  async function mudarDisp(novo: StatusDisponibilidade) {
    const anterior = disp;
    setDisp(novo);
    try {
      const r = await fetch("/api/atendimento/disponibilidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo }),
      });
      if (!r.ok) setDisp(anterior);
    } catch {
      setDisp(anterior);
    }
  }

  async function marcarNotifsLidas() {
    setNotifs((cur) => cur.map((n) => ({ ...n, lida: true })));
    prevNaoLidasRef.current = 0;
    await fetch("/api/atendimento/notificacoes", { method: "POST" }).catch(() => {});
  }

  function alternarSom() {
    setSomAtivo((v) => {
      const prox = !v;
      try {
        window.localStorage.setItem(CHAVE_SOM, prox ? "1" : "0");
      } catch {
        /* ignora */
      }
      if (prox) tocarAlertaSuave();
      return prox;
    });
  }

  async function abrirPerfil() {
    setPerfilAberto(true);
    setPerfilFeedback(null);
    setSenhaAtual("");
    setNovaSenha("");
    try {
      const r = await fetch("/api/atendimento/perfil", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { nome?: string; assinarMensagens?: boolean };
      if (d.nome) setPerfilNome(d.nome);
      if (typeof d.assinarMensagens === "boolean") setAssinarMsgs(d.assinarMensagens);
    } catch {
      /* usa valores locais */
    }
  }

  async function salvarPerfil(e: React.FormEvent) {
    e.preventDefault();
    if (perfilSalvando) return;
    setPerfilSalvando(true);
    setPerfilFeedback(null);
    try {
      const r = await fetch("/api/atendimento/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: perfilNome.trim(),
          assinarMensagens: assinarMsgs,
          ...(novaSenha ? { senhaAtual, novaSenha } : {}),
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Não foi possível salvar.");
      setSenhaAtual("");
      setNovaSenha("");
      setPerfilFeedback({ ok: true, msg: "Perfil atualizado." });
      router.refresh();
    } catch (err) {
      setPerfilFeedback({ ok: false, msg: err instanceof Error ? err.message : "Erro ao salvar perfil." });
    } finally {
      setPerfilSalvando(false);
    }
  }

  async function enviarNovaConversa(e: React.FormEvent) {
    e.preventDefault();
    if (novaEnviando) return;
    setNovaEnviando(true);
    setNovaErro(null);
    try {
      const r = await fetch("/api/atendimento/nova-conversa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: novaNumero.trim(), texto: novaTexto.trim() }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; slug?: string; error?: string };
      if (!r.ok || !d.ok || !d.slug) throw new Error(d.error ?? "Falha ao iniciar conversa.");
      setNovaAberta(false);
      setNovaNumero("");
      setNovaTexto("");
      router.push(`/atendimento/g/${encodeURIComponent(d.slug)}`);
    } catch (err) {
      setNovaErro(err instanceof Error ? err.message : "Erro ao iniciar conversa.");
    } finally {
      setNovaEnviando(false);
    }
  }

  const notifsNaoLidas = notifs.filter((n) => !n.lida).length;

  return (
    <>
      <nav
        aria-label="Seções"
        className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-rail px-1.5 pb-3 pt-3.5 max-[860px]:w-full max-[860px]:flex-row max-[860px]:justify-around max-[860px]:border-r-0 max-[860px]:border-t max-[860px]:px-1 max-[860px]:pb-[calc(6px+env(safe-area-inset-bottom,0px))] max-[860px]:pt-1.5"
      >
        <Link
          href="/atendimento"
          aria-label="WACrew, caixa de entrada"
          className="relative mb-3.5 grid h-8 w-8 place-items-center rounded-[9px] bg-ink max-[860px]:hidden"
        >
          <span className="h-[3px] w-3.5 rounded-sm bg-on-ink shadow-[0_-6px_0_-0.5px_color-mix(in_srgb,var(--color-on-ink)_55%,transparent)]" />
          <span className="absolute -right-1 -top-1 grid place-items-center rounded-full bg-rail p-[3px]">
            <PontoDeConexao open={open} pairing={pairing} />
          </span>
        </Link>

        <Link
          href="/atendimento"
          aria-current={naCaixa ? "page" : undefined}
          className={`${ITEM} ${naCaixa ? "bg-accent-soft text-fg [&_svg]:text-accent" : "text-fg-faint hover:bg-elevated hover:text-fg"}`}
        >
          <Icone nome="inbox" tamanho={20} />
          Caixa
          {naoLidas > 0 && (
            <span className="absolute right-[9px] top-[3px] min-w-[18px] rounded-full bg-accent px-[5px] text-center font-mono text-[10.5px] font-medium leading-[18px] text-accent-ink shadow-[0_0_0_2px_var(--color-rail)] max-[860px]:right-[calc(50%-22px)]">
              {naoLidas > 99 ? "99+" : naoLidas}
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={() => {
            setNovaErro(null);
            setNovaAberta(true);
          }}
          className={`${ITEM} text-fg-faint hover:bg-elevated hover:text-fg`}
        >
          <Icone nome="plus" tamanho={20} />
          Nova
        </button>

        <div ref={notifRef} className="relative">
          <button
            type="button"
            aria-expanded={notifAberto}
            onClick={() => {
              setNotifAberto((v) => !v);
              void carregarNotifs();
            }}
            className={`${ITEM} ${notifAberto ? "bg-elevated text-fg" : "text-fg-faint hover:bg-elevated hover:text-fg"}`}
          >
            <Icone nome="bell" tamanho={20} />
            Avisos
            {notifsNaoLidas > 0 && (
              <span className="absolute right-[9px] top-[3px] min-w-[18px] rounded-full bg-warn-mark px-[5px] text-center font-mono text-[10.5px] font-medium leading-[18px] text-ink shadow-[0_0_0_2px_var(--color-rail)] max-[860px]:right-[calc(50%-22px)]">
                {notifsNaoLidas > 99 ? "99+" : notifsNaoLidas}
              </span>
            )}
          </button>

          {notifAberto && (
            <div className="pop-in fixed bottom-16 left-20 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-[12px] border border-line bg-surface p-3 [box-shadow:var(--float)] max-[860px]:bottom-20 max-[860px]:left-4">
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
                <strong className="text-[13px] font-semibold text-fg">Notificações internas</strong>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <button
                    type="button"
                    onClick={alternarSom}
                    className={`rounded px-1.5 py-0.5 ${somAtivo ? "bg-accent-soft text-accent" : "text-fg-faint hover:text-fg"}`}
                    title="Som ao receber menção ou delegação"
                  >
                    Som: {somAtivo ? "on" : "off"}
                  </button>
                  {notifsNaoLidas > 0 && (
                    <button
                      type="button"
                      onClick={() => void marcarNotifsLidas()}
                      className="text-accent hover:underline"
                    >
                      Marcar lidas
                    </button>
                  )}
                </div>
              </div>
              {notifs.length === 0 ? (
                <p className="py-4 text-center text-[12.5px] text-fg-faint">Nenhuma menção ou delegação recente.</p>
              ) : (
                <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                  {notifs.map((n) => (
                    <li key={n.id}>
                      <Link
                        href={`/atendimento/g/${encodeURIComponent(n.slug)}`}
                        onClick={() => {
                          setNotifAberto(false);
                          if (!n.lida) void marcarNotifsLidas();
                        }}
                        className={`block rounded-[6px] px-2 py-2 text-[12.5px] hover:bg-surface-2 ${!n.lida ? "bg-accent-soft/40" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11.5px] text-fg-dim">
                          <span className="font-semibold text-fg">
                            {n.deNome} · {n.tipo === "mencao" ? "mencionou você" : "delegou"}
                          </span>
                          <span className="font-mono text-fg-faint">{n.timestamp.slice(11, 16)}</span>
                        </div>
                        {n.texto && <p className="mt-0.5 truncate text-fg-dim">{n.texto}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <span className="flex-1 max-[860px]:hidden" />

        <button type="button" onClick={alternar} className={`${ITEM} text-fg-faint hover:bg-elevated hover:text-fg max-[860px]:hidden`}>
          <Icone nome={escuro ? "sun" : "moon"} tamanho={20} />
          Tema
        </button>

        <button type="button" onClick={() => void abrirPerfil()} className={`${ITEM} text-fg-faint hover:bg-elevated hover:text-fg`}>
          <Icone nome="user" tamanho={20} />
          Perfil
        </button>

        <button
          type="button"
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" }).catch(() => {});
            window.location.assign("/login");
          }}
          className={`${ITEM} text-fg-faint hover:bg-elevated hover:text-danger`}
        >
          <Icone nome="logout" tamanho={20} />
          Sair
        </button>

        <button
          type="button"
          onClick={() => void abrirPerfil()}
          title={`${nome} (${LABEL_DISP[disp]}) · WhatsApp ${estado}`}
          aria-label={`Abrir perfil de ${nome} (${LABEL_DISP[disp]})`}
          className="relative mt-1.5 grid h-8 w-8 place-items-center rounded-[9px] border border-line bg-elevated text-xs font-semibold text-fg-dim hover:border-line-2 max-[860px]:hidden"
        >
          {iniciais(nome)}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px] rounded-full shadow-[0_0_0_2px_var(--color-rail)] ${COR_DISP[disp]}`}
          />
        </button>
      </nav>

      {novaAberta && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-[2px]"
          onClick={() => setNovaAberta(false)}
          role="presentation"
        >
          <form
            onSubmit={(e) => void enviarNovaConversa(e)}
            onClick={(e) => e.stopPropagation()}
            className="pop-in w-full max-w-md space-y-4 rounded-[14px] border border-line bg-surface p-5 [box-shadow:var(--float)]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-fg">Nova conversa</h3>
              <button
                type="button"
                onClick={() => setNovaAberta(false)}
                aria-label="Fechar"
                className="grid h-7 w-7 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-fg"
              >
                <Icone nome="x" tamanho={14} />
              </button>
            </div>
            <Field label="Número (DDD + número)" htmlFor="atend-nova-num">
              <Input
                id="atend-nova-num"
                value={novaNumero}
                onChange={(e) => setNovaNumero(e.target.value)}
                placeholder="Ex.: 11 99999-9999"
                required
              />
            </Field>
            <Field label="Primeira mensagem" htmlFor="atend-nova-msg">
              <textarea
                id="atend-nova-msg"
                value={novaTexto}
                onChange={(e) => setNovaTexto(e.target.value)}
                rows={3}
                required
                placeholder="Escreva a mensagem inicial…"
                className="w-full rounded-control border border-line bg-surface-2 px-3 py-2 text-[13.5px] text-fg focus:border-accent focus:outline-none"
              />
            </Field>
            {novaErro && <p className="text-[12.5px] text-danger">{novaErro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNovaAberta(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={novaEnviando} disabled={!novaNumero.trim() || !novaTexto.trim()}>
                Enviar e abrir
              </Button>
            </div>
          </form>
        </div>
      )}

      {perfilAberto && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-[2px]"
          onClick={() => setPerfilAberto(false)}
          role="presentation"
        >
          <form
            onSubmit={(e) => void salvarPerfil(e)}
            onClick={(e) => e.stopPropagation()}
            className="pop-in w-full max-w-md space-y-4 rounded-[14px] border border-line bg-surface p-5 [box-shadow:var(--float)]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-fg">Meu perfil e disponibilidade</h3>
              <button
                type="button"
                onClick={() => setPerfilAberto(false)}
                aria-label="Fechar"
                className="grid h-7 w-7 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-fg"
              >
                <Icone nome="x" tamanho={14} />
              </button>
            </div>

            <div>
              <span className="mb-1.5 block text-[12.5px] font-medium text-fg-dim">Disponibilidade</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(["online", "ocupado", "offline"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => void mudarDisp(st)}
                    className={`flex items-center justify-center gap-1.5 rounded-control border px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                      disp === st ? "border-accent bg-accent-soft text-fg" : "border-line bg-surface-2 text-fg-dim hover:text-fg"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${COR_DISP[st]}`} />
                    {LABEL_DISP[st]}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Nome exibido" htmlFor="atend-perfil-nome">
              <Input
                id="atend-perfil-nome"
                value={perfilNome}
                onChange={(e) => setPerfilNome(e.target.value)}
                required
              />
            </Field>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-control border border-line bg-surface-2 px-3 py-2 text-[13px] text-fg">
              <span>Assinar mensagens (*{perfilNome || nome}:*)</span>
              <input
                type="checkbox"
                checked={assinarMsgs}
                onChange={(e) => setAssinarMsgs(e.target.checked)}
              />
            </label>

            <div className="space-y-2 border-t border-line pt-3">
              <span className="block text-[12.5px] font-medium text-fg-dim">Trocar senha (opcional)</span>
              <Input
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                placeholder="Senha atual"
                autoComplete="current-password"
              />
              <Input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Nova senha (mín. 6 caracteres)"
                autoComplete="new-password"
              />
            </div>

            {perfilFeedback && (
              <p className={`text-[12.5px] ${perfilFeedback.ok ? "text-ok" : "text-danger"}`}>
                {perfilFeedback.msg}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPerfilAberto(false)}>
                Fechar
              </Button>
              <Button type="submit" loading={perfilSalvando}>
                Salvar
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** Faixa de aviso no topo da fila quando o WhatsApp cai: o que o atendente escrever não sai. */
export function AvisoDesconectado() {
  const coletor = useStatusColetor();
  if (!coletor.carregado || coletor.open) return null;
  return (
    <p role="alert" className="flex items-start gap-2 border-b border-line bg-danger-bg px-5 py-2.5 text-[12.5px] text-danger max-[860px]:px-4">
      <Icone nome="alert" tamanho={15} className="mt-px shrink-0" />
      O WhatsApp está desconectado. As mensagens não saem até reconectar.
    </p>
  );
}
