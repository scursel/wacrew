"use client";

import { type CSSProperties, useCallback, useRef, useState } from "react";
import { corDoMatiz, iniciais, matizDoNome } from "@/lib/aparencia";
import { cn } from "./cn";

type Tamanho = "xs" | "sm" | "md" | "lg";

const TAMANHO: Record<Tamanho, string> = {
  xs: "h-[22px] w-[22px] text-[9.5px]",
  sm: "h-7 w-7 text-[10.5px]",
  md: "h-9 w-9 text-[12.5px]",
  lg: "h-10 w-10 text-[13px]",
};

const RAIO_GRUPO: Record<Tamanho, string> = {
  xs: "rounded-[6px]",
  sm: "rounded-[8px]",
  md: "rounded-[10px]",
  lg: "rounded-[10px]",
};

export interface AvatarProps {
  nome: string;
  /** Grupo é quadrado arredondado; conversa direta é círculo. */
  tipo?: "grupo" | "dm";
  /** URL já resolvida da foto (rotas.midia(avatarPath)). Sem foto, ou se falhar, mostra as iniciais. */
  fotoUrl?: string | null;
  tamanho?: Tamanho;
  className?: string;
  /** true quando o nome já aparece escrito ao lado (o avatar some para o leitor de tela). */
  decorativo?: boolean;
  /** Com foto, clicar abre a foto maior numa janela flutuante (fecha com Esc, clique fora ou no X). */
  ampliavel?: boolean;
}

export function Avatar({ nome, tipo = "grupo", fotoUrl, tamanho = "md", className, decorativo = true, ampliavel = false }: AvatarProps) {
  // Guarda QUAL url falhou: trocar a foto volta a tentar, sem estado preso.
  const [urlQuebrada, setUrlQuebrada] = useState<string | null>(null);
  const falhou = Boolean(fotoUrl) && urlQuebrada === fotoUrl;
  // O <img> vem do servidor; se o erro chega antes da hidratação, o onError não dispara.
  const conferir = useCallback(
    (img: HTMLImageElement | null) => {
      if (img && fotoUrl && img.complete && img.naturalWidth === 0) setUrlQuebrada(fotoUrl);
    },
    [fotoUrl],
  );
  const forma = tipo === "dm" ? "rounded-full" : RAIO_GRUPO[tamanho];

  if (fotoUrl && !falhou) {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl}
        alt={decorativo ? "" : nome}
        aria-hidden={decorativo || undefined}
        ref={conferir}
        onError={() => setUrlQuebrada(fotoUrl)}
        className={cn(TAMANHO[tamanho], forma, "shrink-0 border border-line object-cover", className)}
      />
    );
    return ampliavel ? <FotoAmpliavel nome={nome} fotoUrl={fotoUrl} forma={forma}>{img}</FotoAmpliavel> : img;
  }

  return (
    <span
      aria-hidden={decorativo || undefined}
      aria-label={decorativo ? undefined : nome}
      role={decorativo ? undefined : "img"}
      style={{ "--hue": corDoMatiz(matizDoNome(nome)) } as CSSProperties}
      className={cn("avatar-matiz grid shrink-0 select-none place-items-center font-semibold leading-none", TAMANHO[tamanho], forma, className)}
    >
      {iniciais(nome)}
    </span>
  );
}

/**
 * Botão em volta do avatar que abre a foto grande num <dialog> nativo: flutua acima de tudo,
 * fecha com Esc (do próprio navegador), clique no fundo ou no X, e devolve o foco ao avatar.
 */
function FotoAmpliavel({ nome, fotoUrl, forma, children }: { nome: string; fotoUrl: string; forma: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        title={`Ver foto de ${nome}`}
        aria-label={`Ver foto de ${nome} maior`}
        className={cn("focus-ring shrink-0 cursor-zoom-in transition-opacity hover:opacity-85", forma)}
      >
        {children}
      </button>
      <dialog
        ref={ref}
        aria-label={`Foto de ${nome}`}
        // Clique no fundo (fora da foto) fecha: o alvo é o próprio <dialog>, não o conteúdo.
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto max-h-none max-w-none overflow-visible bg-transparent p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <figure className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fotoUrl}
            alt={`Foto de ${nome}`}
            className="block max-h-[min(80vh,640px)] w-auto max-w-[min(90vw,640px)] rounded-card object-contain [box-shadow:var(--float)]"
          />
          <figcaption className="mt-2 text-center text-[13px] font-medium text-white/90">{nome}</figcaption>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fechar"
            title="Fechar (Esc)"
            className="focus-ring absolute -right-3 -top-3 grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-fg [box-shadow:var(--float)] hover:bg-elevated"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </figure>
      </dialog>
    </>
  );
}
