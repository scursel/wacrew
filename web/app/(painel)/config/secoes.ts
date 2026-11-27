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
export const SECOES: Array<{ id: IdSecao; rotulo: string; grupo: string; icone: NomeIcone }> = [
  { id: "conexao", rotulo: "Conexão", grupo: "WhatsApp", icone: "phone" },
  { id: "grupos", rotulo: "Grupos", grupo: "WhatsApp", icone: "users" },
  { id: "sincronizacao", rotulo: "Sincronização", grupo: "WhatsApp", icone: "refresh" },
  { id: "notificacoes", rotulo: "Alertas do painel", grupo: "Notificações", icone: "bell" },
  { id: "radar", rotulo: "Radar", grupo: "Notificações", icone: "clock" },
  { id: "modelos", rotulo: "Modelos de IA", grupo: "Inteligência Artificial", icone: "spark" },
  { id: "transcricao", rotulo: "Transcrição", grupo: "Inteligência Artificial", icone: "mic" },
  { id: "respostas", rotulo: "Respostas prontas", grupo: "Atendimento", icone: "chat" },
  { id: "expediente", rotulo: "Horário comercial", grupo: "Atendimento", icone: "clock" },
  { id: "automacoes", rotulo: "Automações", grupo: "Atendimento", icone: "spark" },
  { id: "time", rotulo: "Meu time", grupo: "Atendimento", icone: "user" },
  { id: "canais", rotulo: "Outros chips", grupo: "Avançado", icone: "phone" },
  { id: "webhooks", rotulo: "Webhooks", grupo: "Avançado", icone: "link" },
];

/** Margem de rolagem dos cards: abaixo da barra parada no topo (e da faixa de seções no celular). */
export const ANCORA_CARD = "scroll-mt-8 max-[1020px]:scroll-mt-20";
