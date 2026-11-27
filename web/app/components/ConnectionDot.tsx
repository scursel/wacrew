"use client";

import { useEffect, useRef, useState } from "react";
import { checarSessao, useRotas } from "./RotasPainel";

type Status = { connection?: string; qr?: string | null };

export interface EstadoColetor {
  /** Já veio a primeira resposta (ou falha) — antes disso nada é afirmado. */
  carregado: boolean;
  open: boolean;
  pairing: boolean;
}

/** Polling leve do status do coletor: 15 s quando open, 5 s nos demais; pausa com a aba oculta. */
export function useStatusColetor(): EstadoColetor {
  const rotas = useRotas();
  const [status, setStatus] = useState<Status | null>(null);
  const [reachable, setReachable] = useState(true);
  const [carregado, setCarregado] = useState(false);
  const statusRef = useRef<Status | null>(null);
  statusRef.current = status;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = checarSessao(await fetch(rotas.status, { cache: "no-store" }), rotas);
        const data = (await res.json()) as Status;
        if (alive) {
          setStatus(data);
          setReachable(true);
          statusRef.current = data;
        }
      } catch {
        if (alive) setReachable(false);
      } finally {
        if (alive) setCarregado(true);
      }
    };

    const agendar = () => {
      clearTimeout(timer);
      if (!alive) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const open = statusRef.current?.connection === "open";
      const ms = open ? 15_000 : 5_000;
      timer = setTimeout(() => {
        void tick().then(() => {
          if (alive) agendar();
        });
      }, ms);
    };

    const aoVisibilidade = () => {
      if (document.visibilityState === "visible") {
        void tick().then(() => {
          if (alive) agendar();
        });
      } else {
        clearTimeout(timer);
      }
    };

    void tick().then(() => {
      if (alive) agendar();
    });
    document.addEventListener("visibilitychange", aoVisibilidade);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVisibilidade);
    };
  }, [rotas]);

  const open = reachable && status?.connection === "open";
  const pairing = Boolean(reachable && (status?.qr || status?.connection === "connecting"));
  return { carregado, open, pairing };
}

/** Bolinha a partir de um estado já lido (quem mostra mais coisa reaproveita o mesmo polling). */
export function PontoDeConexao({ open, pairing }: Pick<EstadoColetor, "open" | "pairing">) {
  const color = open ? "bg-ok" : pairing ? "bg-accent" : "bg-danger";
  const label = open ? "conectado" : pairing ? "pareando" : "offline";

  return (
    <span className="relative inline-flex h-2 w-2" title={`Coletor: ${label}`}>
      {(open || pairing) && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${color}`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

/** Bolinha de status da conexão do coletor (verde = aberto, âmbar = pareando, vermelho = offline). */
export function ConnectionDot() {
  const { open, pairing } = useStatusColetor();
  return <PontoDeConexao open={open} pairing={pairing} />;
}
