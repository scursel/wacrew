"use client";

import { useEffect, useState } from "react";
import { pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Badge, Card, Field, Icone, Select } from "@/app/components/ui";
import type { PanelSettings } from "@/lib/config";
import { EVENTO_MODELOS_ATUALIZADO } from "./ModelosCard";
import { Carregando, FalhaAoCarregar, RodapeSalvar, useSalvar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

interface InfoTranscricao {
  modo: "mlx" | "9router";
  modelo9router: string | null;
  temChave9router: boolean;
}

type RespostaSettings = PanelSettings & {
  transcricao?: InfoTranscricao;
};

const MODELOS = [
  { value: "mlx-community/whisper-large-v3-mlx", label: "large-v3 (máxima precisão)" },
  { value: "mlx-community/whisper-large-v3-turbo", label: "large-v3-turbo (mais rápido)" },
];

const IDIOMAS = [
  { value: "pt", label: "Português" },
  { value: "en", label: "Inglês" },
  { value: "es", label: "Espanhol" },
  { value: "auto", label: "Detectar automático" },
];

/** Transcrição de áudio: mostra o motor real (9router ou MLX local) e configura o idioma. */
export function TranscricaoCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar } = useCarregar<RespostaSettings>("/api/settings");
  const [salvos, setSalvos] = useState<PanelSettings | null>(null);
  const [campos, setCampos] = useState<PanelSettings | null>(null);
  const [info, setInfo] = useState<InfoTranscricao | null>(null);
  const [idiomaVazio, setIdiomaVazio] = useState(false);
  const salvar = useSalvar();

  useEffect(() => {
    if (!dados) return;
    setSalvos({ model: dados.model, language: dados.language });
    setCampos({ model: dados.model, language: dados.language });
    setInfo(dados.transcricao ?? null);
  }, [dados]);

  // Quando Modelos de IA salva/remove chave ou função, recarrega o motor de fala na hora.
  useEffect(() => {
    const aoAtualizar = () => {
      void recarregar();
    };
    window.addEventListener(EVENTO_MODELOS_ATUALIZADO, aoAtualizar);
    return () => window.removeEventListener(EVENTO_MODELOS_ATUALIZADO, aoAtualizar);
  }, [recarregar]);

  const via9router = info?.modo === "9router";
  const ativo9router = Boolean(via9router && info?.temChave9router && info?.modelo9router);

  useEffect(() => {
    if (!salvos) return;
    if (via9router) {
      aoResumir(
        "transcricao",
        ativo9router ? { texto: `9router · ${salvos.language}`, tom: "ok" } : { texto: "desligada" },
      );
    } else {
      aoResumir("transcricao", { texto: `local · ${salvos.language}`, tom: "ok" });
    }
  }, [aoResumir, salvos, via9router, ativo9router]);

  async function aoSalvar() {
    if (!campos) return;
    const language = campos.language.trim();
    if (!language) {
      setIdiomaVazio(true);
      return;
    }
    await salvar.rodar(async () => {
      const novos = await pedirJson<RespostaSettings>("/api/settings", { corpo: { model: campos.model, language } });
      setSalvos({ model: novos.model, language: novos.language });
      setCampos({ model: novos.model, language: novos.language });
      if (novos.transcricao) setInfo(novos.transcricao);
    });
  }

  // Modelo definido por variável de ambiente e fora da lista continua escolhível (só usado no Mac/MLX).
  const modelos = campos && !MODELOS.some((m) => m.value === campos.model) ? [...MODELOS, { value: campos.model, label: campos.model }] : MODELOS;
  const idiomas =
    campos && !IDIOMAS.some((i) => i.value === campos.language)
      ? [...IDIOMAS, { value: campos.language, label: `${campos.language} (customizado)` }]
      : IDIOMAS;
  const alterado = Boolean(
    campos && salvos && (campos.language !== salvos.language || (!via9router && campos.model !== salvos.model)),
  );

  const campoIdioma = campos ? (
    <Field
      label="Idioma"
      htmlFor="transcricao-idioma"
      error={idiomaVazio ? "Informe o idioma." : undefined}
      hint="Enviado ao motor de transcrição."
    >
      <Select
        id="transcricao-idioma"
        value={campos.language}
        onChange={(e) => {
          setCampos({ ...campos, language: e.target.value });
          setIdiomaVazio(false);
        }}
        aria-invalid={idiomaVazio || undefined}
      >
        {idiomas.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </Select>
    </Field>
  ) : null;

  return (
    <Card
      id="transcricao"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Transcrição"
      icone={<Icone nome="mic" />}
      acoes={
        info ? (
          via9router ? (
            <Badge variant={ativo9router ? "ok" : "neutral"} dot={ativo9router}>
              {ativo9router ? "Via 9router" : "Desligada"}
            </Badge>
          ) : (
            <Badge variant="ok" dot>
              Local (MLX)
            </Badge>
          )
        ) : undefined
      }
      rodape={
        campos ? (
          <RodapeSalvar
            info="Vale para os próximos áudios (os já transcritos ficam em cache no disco)."
            estado={salvar.estado}
            erro={salvar.erro}
            alterado={alterado}
            aoSalvar={() => void aoSalvar()}
          />
        ) : undefined
      }
    >
      {erro ? (
        <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />
      ) : !campos ? (
        <Carregando linhas={2} />
      ) : via9router ? (
        <div className="grid grid-cols-[minmax(0,1fr)_180px] items-start gap-4 max-[860px]:grid-cols-1">
          <div className="rounded-control border border-line bg-surface-2/60 p-3.5 text-[13px] leading-relaxed text-fg-dim">
            <p className="font-medium text-fg">Transcrição na nuvem via 9router (não roda local neste servidor)</p>
            {ativo9router ? (
              <p className="mt-1">
                Modelo ativo:{" "}
                <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12px] text-fg">{info?.modelo9router}</code>.{" "}
                <a href="#modelos" className="font-medium text-accent hover:underline">
                  Trocar em Modelos de IA
                </a>
              </p>
            ) : (
              <p className="mt-1">
                Nenhum modelo de fala configurado no 9router — a transcrição de áudio está desligada.{" "}
                <a href="#modelos" className="font-medium text-accent hover:underline">
                  Configurar em Modelos de IA
                </a>
              </p>
            )}
          </div>
          {campoIdioma}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-4 max-[860px]:grid-cols-1">
          <Field
            label="Modelo (MLX, local neste Mac)"
            htmlFor="transcricao-modelo"
            hint="Roda localmente no Apple Silicon sem enviar áudio para fora."
          >
            <Select id="transcricao-modelo" value={campos.model} onChange={(e) => setCampos({ ...campos, model: e.target.value })}>
              {modelos.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          {campoIdioma}
        </div>
      )}
    </Card>
  );
}
