import { notFound } from "next/navigation";
import { GroupWorkspace } from "@/app/components/GroupWorkspace";
import { atribuicaoDaConversaAberta } from "@/lib/caixa-dados";
import { conversationName, readGroupRecords } from "@/lib/data";
import { fundirMensagens } from "@/lib/dm-irmaos";
import { irmaosLiberados } from "@/lib/equipe/acesso";
import { janelaDaConversa, totalDaConversa } from "@/lib/equipe/conversa";
import { listaDaPagina, paginaDoAtendente } from "@/lib/equipe/pagina";
import { dadosDoPainel } from "@/lib/painel-cliente";
import { estaResolvida, ultimoAtendimento } from "@/lib/ultimo-atendimento";

export const dynamic = "force-dynamic";

/** Conversa da equipe: o painel do cliente mostra só pessoas e mídia (sem notas, contrato nem copiloto). */
export default async function AtendimentoChat({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await paginaDoAtendente();
  if (!p || !p.a.chats.has(slug)) notFound();
  const irmaos = await irmaosLiberados(p.a, slug);
  // A lista vem do mesmo cache da renderização do layout: nada de listGroups de novo.
  const [messages, total, lista, listas] = await Promise.all([
    janelaDaConversa(irmaos, { limit: 150 }),
    totalDaConversa(irmaos),
    listaDaPagina(),
    Promise.all(irmaos.map((s) => readGroupRecords(s))),
  ]);
  const fallback = conversationName(slug, messages.at(-1)?.group ?? slug, messages);
  const canonico = p.canonicoDe(slug);
  const item = lista?.find((x) => x.slug === canonico);
  const groupName = item?.name ?? fallback;
  const registros = fundirMensagens(listas);
  const painel = await dadosDoPainel(
    { slug, nome: groupName, avatarPath: item?.avatarPath ?? null, registros },
    null,
  );
  // A atribuição vale no slug canônico, como na lista da equipe.
  const atribuicao = await atribuicaoDaConversaAberta(canonico, p.a.usuario.login);
  return (
    <GroupWorkspace
      key={slug}
      slug={slug}
      groupName={groupName}
      messages={messages}
      ultimoAtendimento={await ultimoAtendimento(irmaos, undefined, registros)}
      total={total}
      painel={painel}
      agora={Date.now()}
      atribuicao={atribuicao}
      resolvida={await estaResolvida(irmaos, undefined, registros)}
      copilotoLiberado={Boolean(p.a.usuario.copilotoLiberado)}
    />
  );
}
