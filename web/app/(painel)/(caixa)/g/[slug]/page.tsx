import { redirect } from "next/navigation";
import { GroupWorkspace } from "@/app/components/GroupWorkspace";
import { atribuicaoDaConversaAberta, conversasDaRequisicao } from "@/lib/caixa-dados";
import { conversationName, readGroupRecords } from "@/lib/data";
import { fundirMensagens } from "@/lib/dm-irmaos";
import { resolverIrmaosDm } from "@/lib/dm-conversa";
import { janelaDaConversa, totalDaConversa } from "@/lib/equipe/conversa";
import { DONO } from "@/lib/equipe/atribuicoes";
import { dadosDoPainel } from "@/lib/painel-cliente";
import { readTriage } from "@/lib/triage";
import { estaResolvida, ultimoAtendimento } from "@/lib/ultimo-atendimento";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { irmaos, canonico } = await resolverIrmaosDm(slug);
  const groups = await conversasDaRequisicao();
  const existentes = new Set(groups.map((x) => x.slug));
  // LID fundido no telefone (ou slug sumido do disco): manda pro canônico.
  if (slug !== canonico && (!existentes.has(slug) || existentes.has(canonico))) {
    redirect(`/g/${canonico}`);
  }
  // Janela como no WhatsApp: só as últimas 150 vão no HTML, o resto pagina sob
  // demanda. Os registros fundidos (irmãos telefone × LID) alimentam o painel.
  const [messages, total, listas, triage] = await Promise.all([
    janelaDaConversa(irmaos, { limit: 150 }),
    totalDaConversa(irmaos),
    Promise.all(irmaos.map((s) => readGroupRecords(s))),
    readTriage(),
  ]);
  const registros = fundirMensagens(listas);
  // Conversa direta mostra o nome do contato (das mensagens recebidas), não o número.
  const groupName = conversationName(slug, messages.at(-1)?.group ?? slug, messages);
  const g = groups.find((x) => x.slug === slug) ?? groups.find((x) => x.slug === canonico);
  const painel = await dadosDoPainel(
    { slug: canonico, nome: g?.name ?? groupName, avatarPath: g?.avatarPath ?? null, registros },
    triage,
  );
  // A atribuição mora no slug canônico (DM partida em telefone × LID é uma conversa só).
  const atribuicao = await atribuicaoDaConversaAberta(canonico, DONO);

  return (
    <GroupWorkspace
      key={canonico}
      slug={canonico}
      groupName={g?.name ?? groupName}
      messages={messages}
      ultimoAtendimento={await ultimoAtendimento(irmaos, triage.resolved, registros)}
      total={total}
      painel={painel}
      agora={Date.now()}
      donoLogin={process.env.PANEL_USER?.trim() || null}
      jidReserva={g?.jid ?? null}
      atribuicao={atribuicao}
      resolvida={await estaResolvida(irmaos, triage.resolved, registros)}
      lastSeenInicial={triage.lastSeen[canonico] ?? triage.lastSeen[slug] ?? null}
      snoozedUntilInicial={triage.snoozedUntil[canonico] ?? triage.snoozedUntil[slug] ?? null}
    />
  );
}
