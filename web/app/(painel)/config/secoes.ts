import type { NomeIcone } from "@/app/components/ui";

export type IdSecao =
  | "conexao"
  | "grupos"
  | "sincronizacao"
  | "notificacoes"
  | "radar"
  | "modelos"
  | "transcricao"
  | "respostas"
  | "expediente"
  | "automacoes"
  | "time"
  | "canais"
  | "webhooks";

/** Estado curto de uma seção, mostrado ao lado do nome na navegação ("21/201", "ligado"). */
export interface Resumo {
  texto: string;
  tom?: "ok" | "danger" | "accent";
}

export type AoResumir = (id: IdSecao, resumo: Resumo) => void;

/** Ordem da página. A navegação agrupa por `grupo`, na ordem em que os grupos aparecem. */
/** `href` leva para outra tela em vez de rolar até o card (a Gestão de grupos tem página própria). */
export const SECOES: Array<{ id: IdSecao; rotulo: string; grupo: string; icone: NomeIcone; href?: string }> = [
  { id: "conexao", rotulo: "Conexão", grupo: "WhatsApp", icone: "phone" },
  { id: "grupos", rotulo: "Gestão de grupos", grupo: "WhatsApp", icone: "users", href: "/config/grupos" },
  { id: "notificacoes", rotulo: "Alertas do painel", grupo: "Notificações", icone: "bell" },
  { id: "radar", rotulo: "Radar", grupo: "Notificações", icone: "alert" },
  { id: "modelos", rotulo: "Modelos de IA", grupo: "Inteligência Artificial", icone: "spark" },
  { id: "transcricao", rotulo: "Transcrição", grupo: "Inteligência Artificial", icone: "mic" },
  { id: "respostas", rotulo: "Respostas prontas", grupo: "Atendimento", icone: "chat" },
  { id: "expediente", rotulo: "Horário comercial", grupo: "Atendimento", icone: "clock" },
  { id: "webhooks", rotulo: "Webhooks", grupo: "Integrações", icone: "link" },
];

/** Seções que mudaram para a tela de Gestão de grupos: links antigos (/config#time) seguem para lá. */
export const MOVIDAS_PARA_GRUPOS: ReadonlySet<string> = new Set(["time", "sincronizacao"]);

/** Margem de rolagem dos cards: abaixo da barra parada no topo (e da faixa de seções no celular). */
export const ANCORA_CARD = "scroll-mt-8 max-[1020px]:scroll-mt-20";
