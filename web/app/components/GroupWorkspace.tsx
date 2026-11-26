"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PainelCliente as DadosPainel } from "@/lib/caixa";
import type { MessageView } from "@/lib/data";
import type { UltimoAtendimento } from "@/lib/ultimo-atendimento";
import type { DadosAtribuicaoConversa } from "@/lib/caixa-dados";
import { AtribuicaoConversa, enviarAtribuicao } from "./caixa/AtribuicaoConversa";
import { PainelCliente } from "./caixa/PainelCliente";
import { useRotas } from "./RotasPainel";
import { Timeline } from "./Timeline";
import { Button, IconButton, Icone } from "./ui";
import { atalhoBloqueado } from "./useListNav";

const CHAVE_PAINEL = "wac-painel-cliente";
const ESTREITO = "(max-width: 1360px)";

type Resolucao = "parada" | "salvando" | "feita" | "erro";

/**
 * Conversa e painel do cliente: o centro e a direita da Caixa. Aqui moram as
 * ações da conversa (atribuição, modo de envio, silenciar, resolver) e o painel,
 * que abre e fecha com "]" ou pelo botão do cabeçalho. "E" resolve a conversa
 * aberta, no dono e na equipe.
 */
export function GroupWorkspace({
  slug,
  groupName,
  messages,
  ultimoAtendimento,
  total,
  painel,
  agora,
  donoLogin = null,
  atribuicao,
  resolvida = false,
  lastSeenInicial = null,
  snoozedUntilInicial = null,
  copilotoLiberado = false,
  autonomoInicial,
}: {
  slug: string;
  groupName: string;
  messages: MessageView[];
  ultimoAtendimento?: UltimoAtendimento | null;
  /** Total real de mensagens do chat (a lista acima é só a janela final). */
  total?: number;
  painel: DadosPainel;
  /** Relógio do servidor na montagem. */
  agora: number;
  /** Login do dono no painel, para separar o envio dele do da equipe. */
  donoLogin?: string | null;
  /** Responsável e departamento da conversa, e quem pode receber (ver `atribuicaoDaConversaAberta`). */
  atribuicao: DadosAtribuicaoConversa;
  /** Marcada como resolvida e o cliente não escreveu depois (ver `estaResolvida`): botão verde. */
  resolvida?: boolean;
  lastSeenInicial?: string | null;
  snoozedUntilInicial?: string | null;
  copilotoLiberado?: boolean;
  /** Se a conversa está com IA em modo autônomo (também passado para atendentes). */
  autonomoInicial?: boolean;
}) {
  const rotas = useRotas();
  const router = useRouter();
  const dono = rotas.modo === "dono" ? painel.dono : null;

  // Rascunho do copiloto para o compositor; o nonce reaplica o mesmo texto.
  const [draft, setDraft] = useState<{ text: string; nonce: number } | null>(null);
  const pushDraft = useCallback((text: string) => {
    setDraft((d) => ({ text, nonce: (d?.nonce ?? 0) + 1 }));
  }, []);

  // Painel: ao lado da conversa nas telas largas (lembrado), por cima nas estreitas.
  const [aberto, setAberto] = useState(true);
  const [sobreposto, setSobreposto] = useState(false);
  const [estreito, setEstreito] = useState(false);
  const [pedidoCopiloto, setPedidoCopiloto] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CHAVE_PAINEL) === "fechado") setAberto(false);
    } catch {
      /* sem armazenamento: começa aberto */
    }
    const mq = window.matchMedia(ESTREITO);
    const ler = () => setEstreito(mq.matches);
    ler();
    mq.addEventListener("change", ler);
    return () => mq.removeEventListener("change", ler);
  }, []);

  const alternarPainel = useCallback(() => {
    if (window.matchMedia(ESTREITO).matches) {
      setSobreposto((v) => !v);
      return;
    }
    setAberto((v) => {
      try {
        window.localStorage.setItem(CHAVE_PAINEL, v ? "fechado" : "aberto");
      } catch {
        /* vale só nesta aba */
      }
      return !v;
    });
  }, []);

  const abrirCopiloto = useCallback(() => {
    if (window.matchMedia(ESTREITO).matches) setSobreposto(true);
    else setAberto(true);
    setPedidoCopiloto((n) => n + 1);
  }, []);

  const fecharSobreposto = useCallback(() => setSobreposto(false), []);

  const [silenciado, setSilenciado] = useState(dono?.silenciado ?? false);
  const [autonomo, setAutonomo] = useState(autonomoInicial ?? dono?.autonomo ?? false);
  const [resolucao, setResolucao] = useState<Resolucao>("parada");
  const [assumindo, setAssumindo] = useState<"parada" | "salvando" | "erro">("parada");
  const [assumidoLocal, setAssumidoLocal] = useState(false);
  const [reaberta, setReaberta] = useState(false);
  const [snoozeAberto, setSnoozeAberto] = useState(false);
  const [snoozeAte, setSnoozeAte] = useState<string | null>(snoozedUntilInicial);
  const [snoozeCustom, setSnoozeCustom] = useState("");

  useEffect(() => {
    setReaberta(false);
    setSnoozeAte(snoozedUntilInicial);
    setAutonomo(autonomoInicial ?? dono?.autonomo ?? false);
    setAssumidoLocal(false);
    setAssumindo("parada");
  }, [slug, resolvida, snoozedUntilInicial, autonomoInicial, dono?.autonomo, atribuicao.inicial.responsavel]);

  const triagem = useCallback(async (action: "muted" | "snooze" | "markedUnread", value: boolean | string | null) => {
    const res = await fetch("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, slug, value }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (!res.ok || !data.ok) throw new Error("falha");
  }, [slug]);

  const aplicarSnooze = useCallback(async (untilIso: string | null) => {
    setSnoozeAte(untilIso);
    setSnoozeAberto(false);
    try {
      await triagem("snooze", untilIso);
      router.refresh();
    } catch {
      setSnoozeAte(snoozedUntilInicial);
    }
  }, [triagem, router, snoozedUntilInicial]);

  const marcarNaoLida = useCallback(async () => {
    try {
      await triagem("markedUnread", true);
      router.push(rotas.caixa);
      router.refresh();
    } catch {
      /* ignora */
    }
  }, [triagem, router, rotas.caixa]);

  // Assumir atribui a conversa para quem clicou e desliga o modo autônomo da IA na rota.
  const assumir = useCallback(async () => {
    if (assumindo === "salvando" || resolucao === "salvando") return;
    setAssumindo("salvando");
    try {
      await enviarAtribuicao(slug, { acao: "assumir" }, rotas);
      setAssumidoLocal(true);
      setAutonomo(false);
      setAssumindo("parada");
      router.refresh();
    } catch {
      setAssumindo("erro");
    }
  }, [assumindo, resolucao, slug, rotas, router]);

  useEffect(() => {
    if (assumindo !== "erro") return;
    const t = setTimeout(() => setAssumindo("parada"), 2500);
    return () => clearTimeout(t);
  }, [assumindo]);

  // Resolver solta a conversa: tira o responsável e a marca como resolvida na triagem (a rota faz os dois).
  // Vale para o dono e para a equipe.
  const resolver = useCallback(async () => {
    if (resolucao === "salvando") return;
    setResolucao("salvando");
    setReaberta(false);
    try {
      await enviarAtribuicao(slug, { acao: "resolver" }, rotas);
      setAssumidoLocal(false);
      setResolucao("feita");
      router.refresh();
    } catch {
      setResolucao("erro");
    }
  }, [resolucao, slug, router, rotas]);

  const reabrir = useCallback(async () => {
    if (resolucao === "salvando") return;
    setResolucao("salvando");
    try {
      await enviarAtribuicao(slug, { acao: "reabrir" }, rotas);
      setReaberta(true);
      setResolucao("parada");
      router.refresh();
    } catch {
      setResolucao("erro");
    }
  }, [resolucao, slug, router, rotas]);

  // Verde já no clique (antes de a página voltar do servidor) e enquanto continuar resolvida.
  const verde = resolucao !== "erro" && !reaberta && (resolvida || resolucao === "feita");

  useEffect(() => {
    if (resolucao !== "feita" && resolucao !== "erro") return;
    const t = setTimeout(() => setResolucao("parada"), 2500);
    return () => clearTimeout(t);
  }, [resolucao]);

  const silenciar = useCallback(async () => {
    const novo = !silenciado;
    setSilenciado(novo);
    try {
      await triagem("muted", novo);
      router.refresh();
    } catch {
      setSilenciado(!novo);
    }
  }, [silenciado, triagem, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || atalhoBloqueado(e)) return;
      if (e.key === "]") {
        e.preventDefault();
        alternarPainel();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        void resolver();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alternarPainel, resolver]);

  const painelVisivel = estreito ? sobreposto : aberto;

  const livre = atribuicao.inicial.responsavel === null && !assumidoLocal;
  const podeAssumir = !verde && (livre || autonomo);

  const acoesComposer = verde ? (
    <>
      <Button
        size="sm"
        variant="sucesso"
        onClick={resolver}
        loading={resolucao === "salvando"}
        title="Resolvida. Volta para amarelo quando o cliente escrever de novo (E marca de novo)"
      >
        {resolucao !== "salvando" && <Icone nome="check" tamanho={14} />}
        Resolvida
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={reabrir}
        disabled={resolucao === "salvando"}
        title="Reabrir conversa manualmente"
      >
        Reabrir
      </Button>
    </>
  ) : podeAssumir ? (
    <>
      <Button
        size="sm"
        variant="atencao"
        onClick={() => void assumir()}
        loading={assumindo === "salvando"}
        disabled={resolucao === "salvando"}
        title={
          autonomo
            ? "Assumir o atendimento e desligar a IA autônoma nesta conversa"
            : "Assumir o atendimento desta conversa"
        }
      >
        {assumindo !== "salvando" && <Icone nome="user" tamanho={14} />}
        {assumindo === "erro" ? "Tente de novo" : "Assumir atendimento"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={resolver}
        loading={resolucao === "salvando"}
        disabled={assumindo === "salvando"}
        title="Marcar como resolvida sem assumir (E)"
      >
        {resolucao !== "salvando" && <Icone nome="check" tamanho={14} />}
        {resolucao === "erro" ? "Tente de novo" : "Resolver"}
      </Button>
    </>
  ) : (
    <Button
      size="sm"
      variant="atencao"
      onClick={resolver}
      loading={resolucao === "salvando"}
      title="Marcar como resolvida e soltar o responsável (E)"
    >
      {resolucao !== "salvando" && <Icone nome="check" tamanho={14} />}
      {resolucao === "erro" ? "Tente de novo" : "Resolver"}
    </Button>
  );

  const acoes = (
    <>
      {dono && (
        <span
          className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-tag px-2 text-[12px] font-medium text-fg-dim shadow-[inset_0_0_0_1px_var(--color-line-2)] max-[1180px]:hidden"
          title={autonomo ? "A IA envia direto nesta conversa" : "A IA mostra o texto e espera o seu OK antes de enviar"}
        >
          {autonomo ? "autônomo" : "com confirmação"}
        </span>
      )}
      {dono && (
        <div className="relative max-[860px]:hidden">
          <IconButton
            size="sm"
            aria-pressed={Boolean(snoozeAte)}
            active={Boolean(snoozeAte)}
            onClick={() => setSnoozeAberto((v) => !v)}
            title={snoozeAte ? `Adiada até ${new Date(snoozeAte).toLocaleString("pt-BR")}` : "Adiar conversa (Snooze)"}
            aria-label="Adiar conversa"
          >
            <Icone nome="clock" />
          </IconButton>
          {snoozeAberto && (
            <div className="pop-in absolute right-0 top-full z-40 mt-1.5 w-60 rounded-[10px] border border-line bg-surface p-2 [box-shadow:var(--float)]">
              <p className="px-2 py-1 text-[11.5px] font-medium text-fg-faint">Adiar conversa</p>
              <button
                type="button"
                onClick={() => void aplicarSnooze(new Date(Date.now() + 3_600_000).toISOString())}
                className="block w-full rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-surface-2"
              >
                Em 1 hora
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(9, 0, 0, 0);
                  void aplicarSnooze(d.toISOString());
                }}
                className="block w-full rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-surface-2"
              >
                Amanhã às 9h
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const diff = ((1 + 7 - d.getDay()) % 7) || 7;
                  d.setDate(d.getDate() + diff);
                  d.setHours(9, 0, 0, 0);
                  void aplicarSnooze(d.toISOString());
                }}
                className="block w-full rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-surface-2"
              >
                Próxima segunda às 9h
              </button>
              <div className="mt-1.5 flex items-center gap-1 border-t border-line pt-1.5">
                <input
                  type="datetime-local"
                  value={snoozeCustom}
                  onChange={(e) => setSnoozeCustom(e.target.value)}
                  className="min-w-0 flex-1 rounded-[6px] border border-line bg-surface-2 px-2 py-1 text-[11.5px] text-fg"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!snoozeCustom}
                  onClick={() => {
                    const ms = Date.parse(snoozeCustom);
                    if (Number.isFinite(ms)) void aplicarSnooze(new Date(ms).toISOString());
                  }}
                >
                  OK
                </Button>
              </div>
              {snoozeAte && (
                <button
                  type="button"
                  onClick={() => void aplicarSnooze(null)}
                  className="mt-1 block w-full rounded-[6px] px-2.5 py-1.5 text-left text-[12.5px] text-danger hover:bg-danger-bg"
                >
                  Remover adiamento
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {dono && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void marcarNaoLida()}
          title="Marcar conversa como não lida"
          className="max-[1020px]:hidden"
        >
          Não lida
        </Button>
      )}
      {dono && (
        <IconButton
          size="sm"
          aria-pressed={silenciado}
          active={silenciado}
          onClick={silenciar}
          title={silenciado ? "Voltar a mostrar esta conversa em Esperando você" : "Silenciar: a conversa sai de Esperando você"}
          aria-label={silenciado ? "Deixar de silenciar a conversa" : "Silenciar a conversa"}
          className="max-[860px]:hidden"
        >
          <Icone nome="mute" />
        </IconButton>
      )}
      <IconButton
        size="sm"
        data-alterna-painel
        aria-pressed={painelVisivel}
        active={painelVisivel}
        onClick={alternarPainel}
        title="Painel do cliente (])"
        aria-label={painelVisivel ? "Fechar o painel do cliente" : "Abrir o painel do cliente"}
        className="max-[860px]:h-10 max-[860px]:w-10"
      >
        <Icone nome="panel" />
      </IconButton>
    </>
  );

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <section aria-label={`Conversa com ${groupName}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AtribuicaoConversa
          slug={slug}
          eu={atribuicao.eu}
          inicial={atribuicao.inicial}
          departamentos={atribuicao.departamentos}
          equipe={atribuicao.equipe}
          ultimoAtendimento={ultimoAtendimento}
          autonomo={autonomo}
        />
        <Timeline
          slug={slug}
          groupName={groupName}
          messages={messages}
          ultimoAtendimentoInicial={ultimoAtendimento}
          total={total}
          agoraInicial={agora}
          donoLogin={donoLogin}
          draft={draft}
          onAbrirCopiloto={dono || copilotoLiberado ? abrirCopiloto : undefined}
          lastSeenInicial={lastSeenInicial}
          participantes={painel.pessoas.map((p) => ({ id: p.id, nome: p.nome }))}
          atendenteNome={atribuicao.inicial.responsavelNome ?? donoLogin ?? null}
          departamentoNome={atribuicao.inicial.departamentoNome}
          acoesComposer={acoesComposer}
          cabecalho={{ avatarPath: painel.avatarPath, tipo: painel.tipo, pessoas: painel.pessoas.length, acoes }}
        />
      </section>
      <PainelCliente
        dados={painel}
        aberto={aberto}
        sobreposto={sobreposto}
        agora={agora}
        onFechar={fecharSobreposto}
        onDraft={dono || copilotoLiberado ? pushDraft : undefined}
        onSalvo={() => router.refresh()}
        pedidoCopiloto={pedidoCopiloto}
        copilotoLiberado={copilotoLiberado}
      />
    </div>
  );
}
