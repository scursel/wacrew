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
  const [resolucao, setResolucao] = useState<Resolucao>("parada");

  const triagem = useCallback(async (action: "muted", value: boolean) => {
    const res = await fetch("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, slug, value }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (!res.ok || !data.ok) throw new Error("falha");
  }, [slug]);

  // Resolver solta a conversa: tira o responsável e a marca como resolvida na triagem (a rota faz os dois).
  // Vale para o dono e para a equipe.
  const resolver = useCallback(async () => {
    if (resolucao === "salvando") return;
    setResolucao("salvando");
    try {
      await enviarAtribuicao(slug, { acao: "resolver" }, rotas);
      setResolucao("feita");
      router.refresh();
    } catch {
      setResolucao("erro");
    }
  }, [resolucao, slug, router, rotas]);

  // Verde já no clique (antes de a página voltar do servidor) e enquanto continuar resolvida.
  const verde = resolucao !== "erro" && (resolvida || resolucao === "feita");

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

  const acoes = (
    <>
      {dono && (
        <span
          className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-tag px-2 text-[12px] font-medium text-fg-dim shadow-[inset_0_0_0_1px_var(--color-line-2)] max-[1180px]:hidden"
          title={dono.autonomo ? "A IA envia direto nesta conversa" : "A IA mostra o texto e espera o seu OK antes de enviar"}
        >
          {dono.autonomo ? "autônomo" : "com confirmação"}
        </span>
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
      <Button
        size="sm"
        variant={verde ? "sucesso" : "atencao"}
        onClick={resolver}
        loading={resolucao === "salvando"}
        title={
          verde
            ? "Resolvida. Volta para amarelo quando o cliente escrever de novo (E marca de novo)"
            : "Marcar como resolvida e soltar o responsável (E)"
        }
        className="max-[860px]:h-10"
      >
        {resolucao !== "salvando" && <Icone nome="check" tamanho={15} />}
        {resolucao === "erro" ? "Tente de novo" : verde ? "Resolvida" : "Resolver"}
      </Button>
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
          onAbrirCopiloto={dono ? abrirCopiloto : undefined}
          cabecalho={{ avatarPath: painel.avatarPath, tipo: painel.tipo, pessoas: painel.pessoas.length, acoes }}
        />
      </section>
      <PainelCliente
        dados={painel}
        aberto={aberto}
        sobreposto={sobreposto}
        agora={agora}
        onFechar={fecharSobreposto}
        onDraft={dono ? pushDraft : undefined}
        onSalvo={() => router.refresh()}
        pedidoCopiloto={pedidoCopiloto}
      />
    </div>
  );
}
