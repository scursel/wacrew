import Link from "next/link";
import { Fragment } from "react";
import { type EstadoIa, type LinhaFila, quandoCurto } from "@/lib/caixa";
import { AnelEspera, Avatar, Badge, Contador, Etiqueta, cn, Icone } from "../ui";

/** Estado da IA na linha: o rótulo em texto e os números em mono ("entregando 1/2"). */
export function EstadoDaIa({ ia, className }: { ia: EstadoIa; className?: string }) {
  const partes: Array<[string, boolean]> =
    ia.tipo === "entregando"
      ? [["entregando", false], [`${ia.atual}/${ia.total}`, true]]
      : ia.tipo === "agendado"
        ? [["agendado", false], [ia.hora, true]]
        : [["espera seu OK", false]];
  const titulo =
    ia.tipo === "entregando"
      ? `A IA está entregando a resposta: ${ia.enviados} de ${ia.total} ${ia.total === 1 ? "balão saiu" : "balões saíram"}`
      : ia.tipo === "agendado"
        ? `Resposta da IA agendada: começa a digitar às ${ia.hora}`
        : `A triagem preparou uma pergunta para o cliente; responda "ok ${ia.n}" no seu WhatsApp para enviar`;
  return (
    <span title={titulo} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium leading-none text-id-ia", className)}>
      <Icone nome="spark" tamanho={14} />
      {partes.map(([t, num], i) => (
        <Fragment key={t}>
          {i > 0 && " "}
          <span className={num ? "font-mono tabular-nums" : undefined}>{t}</span>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Uma linha da fila: avatar, nome com uma etiqueta (ou "menção"), espera ou
 * estado da IA, prévia "Fulano: texto", não lidas e, embaixo, chips discretos do
 * departamento (com "sugerido pela IA") e do responsável. A conversa aberta ganha a
 * barra de acento.
 */
export function InboxItem({
  linha,
  href,
  fotoUrl,
  agoraMs,
  atual = false,
  selecionavel = false,
  selecionada = false,
  onToggleSelect,
}: {
  linha: LinhaFila;
  href: string;
  fotoUrl: string | null;
  agoraMs: number;
  /** Conversa aberta agora. */
  atual?: boolean;
  selecionavel?: boolean;
  selecionada?: boolean;
  onToggleSelect?: () => void;
}) {
  // Pede atenção (espera, IA ou não lidas): nome forte. O resto fica mais leve.
  const lida = linha.naoLidas === 0 && !linha.esperaDesde && !linha.ia;
  return (
    <Link
      href={href}
      data-slug={linha.slug}
      aria-current={atual ? "page" : undefined}
      onClick={(e) => {
        if (selecionavel) {
          e.preventDefault();
          onToggleSelect?.();
        }
      }}
      className={cn(
        "relative grid w-full items-center gap-x-3 gap-y-[3px] border-b border-line px-5 py-3.5 text-left text-[14px] leading-normal text-fg outline-none transition-colors max-[860px]:px-4",
        selecionavel ? "grid-cols-[20px_40px_minmax(0,1fr)_auto]" : "grid-cols-[40px_minmax(0,1fr)_auto]",
        "focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)]",
        atual
          ? "bg-selected before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-r-sm before:bg-accent"
          : "hover:bg-surface-2",
      )}
    >
      {selecionavel && (
        <input
          type="checkbox"
          checked={selecionada}
          onChange={() => onToggleSelect?.()}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Selecionar ${linha.nome}`}
          className="row-span-2 h-4 w-4 accent-accent"
        />
      )}
      <Avatar nome={linha.nome} tipo={linha.tipo} fotoUrl={fotoUrl} tamanho="lg" className="row-span-2" />
      <span className="flex min-w-0 items-center gap-1.5">
        <b className={cn("truncate", lida ? "font-medium text-fg-dim" : "font-semibold text-fg")}>{linha.nome}</b>
        {linha.mencao ? (
          <Badge variant="accent" className="h-5 shrink-0 px-1.5 text-[11.5px]">
            menção
          </Badge>
        ) : (
          linha.etiqueta && <Etiqueta nome={linha.etiqueta} tamanho="sm" className="shrink-0" />
        )}
        {linha.aguardaOk !== null && (
          <span
            title={`A triagem preparou uma pergunta para o cliente; responda "ok ${linha.aguardaOk}" no seu WhatsApp para enviar`}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] font-medium text-id-ia"
          >
            <Icone nome="spark" tamanho={12} />
            espera seu OK
          </span>
        )}
      </span>
      <span className="flex items-center justify-self-end gap-1.5">
        {linha.ia ? (
          <EstadoDaIa ia={linha.ia} />
        ) : linha.esperaDesde ? (
          <AnelEspera ms={Math.max(0, agoraMs - Date.parse(linha.esperaDesde))} />
        ) : (
          <>
            {linha.silenciada && <Icone nome="mute" tamanho={13} className="text-fg-mute" aria-label="Silenciada" />}
            <span className="font-mono text-[11.5px] tabular-nums text-fg-faint">{quandoCurto(linha.ultimaEm, agoraMs)}</span>
          </>
        )}
      </span>
      <span className="col-start-2 truncate text-[13px] text-fg-dim">
        {linha.previa ? (
          <>
            {linha.previa.de && <span className="text-fg-faint">{linha.previa.de}: </span>}
            {linha.previa.texto}
          </>
        ) : (
          <span className="text-fg-faint">sem mensagens</span>
        )}
      </span>
      <Contador n={linha.naoLidas} destaque={linha.mencao} className="col-start-3 justify-self-end" />
      {(linha.departamentoNome || linha.responsavelNome) && (
        // Depois do contador de propósito: na grade, o contador continua na linha da prévia e os chips descem uma linha.
        <span className="col-start-2 col-end-4 flex min-w-0 flex-wrap items-center gap-1.5 text-[11.5px] leading-none text-fg-faint">
          {linha.departamentoNome && (
            <span
              title={linha.departamentoSugerido ? "Departamento sugerido pela IA; confirme ou troque" : "Departamento da conversa"}
              className="inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-line-2 px-1.5 py-[3px] text-fg-dim"
            >
              <span className="truncate">{linha.departamentoNome}</span>
              {linha.departamentoSugerido && <span className="whitespace-nowrap text-id-ia">sugerido pela IA</span>}
            </span>
          )}
          {linha.responsavelNome && (
            <span title="Responsável pela conversa" className="inline-flex min-w-0 items-center gap-1">
              <Icone nome="user" tamanho={12} />
              <span className="truncate">{linha.responsavelNome}</span>
            </span>
          )}
        </span>
      )}
    </Link>
  );
}
