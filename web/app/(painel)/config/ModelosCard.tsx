"use client";

import { useEffect, useRef, useState } from "react";
import { mensagemDe, pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Aviso, Badge, BotaoConfirmar, Button, Card, Field, Icone, Input, Select, Spinner } from "@/app/components/ui";
import { Carregando, FalhaAoCarregar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

export type FuncaoIA = "copiloto" | "rascunho" | "postura" | "departamento" | "video" | "transcricao" | "orcamento";

const URL_9ROUTER_PADRAO = "http://100.115.118.6:20128/v1";

interface ConfigModelosPublica {
  baseUrl: string;
  temChave: boolean;
  chaveFinal: string | null;
  funcoes: Partial<Record<FuncaoIA, string>>;
}

interface RespostaModelos extends ConfigModelosPublica {
  combos: string[];
  fala: string[];
  erroLista?: string;
}

interface PedidoSalvarModelos {
  baseUrl?: string;
  chave?: string;
  funcoes?: Partial<Record<FuncaoIA, string | null>>;
}

interface PedidoTestar {
  funcao?: FuncaoIA;
  baseUrl?: string;
  chave?: string;
}

interface RespostaTestar {
  ok: boolean;
  ms?: number;
  combos?: number;
  erro?: string;
}

interface DefinicaoFuncao {
  id: FuncaoIA;
  rotulo: string;
  tipo: "combo" | "fala";
}

const FUNCOES: DefinicaoFuncao[] = [
  { id: "copiloto", rotulo: "Copiloto: resumir e conversar", tipo: "combo" },
  { id: "rascunho", rotulo: "Copiloto: rascunhar e sugerir", tipo: "combo" },
  { id: "postura", rotulo: "Postura (revisão antes de enviar)", tipo: "combo" },
  { id: "departamento", rotulo: "Pré-seleção de departamento e resumo", tipo: "combo" },
  { id: "video", rotulo: "Assistir vídeo", tipo: "combo" },
  { id: "transcricao", rotulo: "Transcrição de áudio", tipo: "fala" },
  { id: "orcamento", rotulo: "Reconhecer orçamento em foto", tipo: "combo" },
];

type FeedbackConexao = { tom: "ok" | "erro"; texto: string } | null;
type ResultadoTesteConexao = { ok: true; combos?: number; ms?: number } | { ok: false; erro: string } | null;
type FeedbackLinha = { tom: "ok" | "erro"; texto: string } | null;
type ResultadoTesteLinha = { ok: true; ms?: number } | { ok: false; erro: string } | null;

function normalizarUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function validarUrl(raw: string): { ok: true; url: string } | { ok: false; erro: string } {
  const url = normalizarUrl(raw);
  if (!url) return { ok: false, erro: "Informe a URL do 9router." };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, erro: "A URL precisa começar com http:// ou https://." };
    }
    return { ok: true, url };
  } catch {
    return { ok: false, erro: "Informe uma URL válida (ex.: http://100.115.118.6:20128/v1)." };
  }
}

function comFuncao(
  funcoes: Partial<Record<FuncaoIA, string>>,
  funcao: FuncaoIA,
  valor: string | undefined,
): Partial<Record<FuncaoIA, string>> {
  const prox = { ...funcoes };
  if (valor) prox[funcao] = valor;
  else delete prox[funcao];
  return prox;
}

async function chamarTestar(corpo: PedidoTestar): Promise<RespostaTestar> {
  let res: Response;
  try {
    res = await fetch("/api/config/modelos/testar", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new Error("Sem conexão com o painel. Tente de novo.");
  }
  const json = (await res.json().catch(() => null)) as (Partial<RespostaTestar> & { error?: unknown }) | null;
  if (!res.ok) {
    const msg =
      typeof json?.erro === "string"
        ? json.erro
        : typeof json?.error === "string"
          ? json.error
          : `O painel respondeu ${res.status}.`;
    return { ok: false, erro: msg };
  }
  return {
    ok: Boolean(json?.ok),
    ms: typeof json?.ms === "number" ? json.ms : undefined,
    combos: typeof json?.combos === "number" ? json.combos : undefined,
    erro: typeof json?.erro === "string" ? json.erro : typeof json?.error === "string" ? json.error : undefined,
  };
}

/** Configuração do 9router e escolha do combo (ou modelo de fala) por função de IA do painel. */
export function ModelosCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar, definir } = useCarregar<RespostaModelos>("/api/config/modelos");

  const [urlInput, setUrlInput] = useState(URL_9ROUTER_PADRAO);
  const [urlInicializada, setUrlInicializada] = useState(false);
  const [chaveInput, setChaveInput] = useState("");
  const [trocandoChave, setTrocandoChave] = useState(false);

  const [erroUrl, setErroUrl] = useState<string | null>(null);
  const [erroChave, setErroChave] = useState<string | null>(null);

  const [salvandoConexao, setSalvandoConexao] = useState(false);
  const [removendoChave, setRemovendoChave] = useState(false);
  const [testandoConexao, setTestandoConexao] = useState(false);
  const [atualizandoLista, setAtualizandoLista] = useState(false);
  const [feedbackConexao, setFeedbackConexao] = useState<FeedbackConexao>(null);
  const [testeConexao, setTesteConexao] = useState<ResultadoTesteConexao>(null);

  const [salvandoLinha, setSalvandoLinha] = useState<Partial<Record<FuncaoIA, boolean>>>({});
  const [feedbackLinha, setFeedbackLinha] = useState<Partial<Record<FuncaoIA, FeedbackLinha>>>({});
  const [testandoLinha, setTestandoLinha] = useState<Partial<Record<FuncaoIA, boolean>>>({});
  const [testeLinha, setTesteLinha] = useState<Partial<Record<FuncaoIA, ResultadoTesteLinha>>>({});

  const listaSeqRef = useRef(0);
  const timerConexao = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timersLinha = useRef<Partial<Record<FuncaoIA, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    return () => {
      clearTimeout(timerConexao.current);
      for (const id of Object.keys(timersLinha.current) as FuncaoIA[]) {
        clearTimeout(timersLinha.current[id]);
      }
    };
  }, []);

  useEffect(() => {
    if (!dados || urlInicializada) return;
    setUrlInput(dados.baseUrl || URL_9ROUTER_PADRAO);
    setUrlInicializada(true);
  }, [dados, urlInicializada]);

  const temChave = Boolean(dados?.temChave);
  const algumaEscolhida = Boolean(dados && FUNCOES.some((f) => Boolean(dados.funcoes[f.id])));
  const ativo9router = temChave && algumaEscolhida;

  useEffect(() => {
    if (!dados) return;
    aoResumir("modelos", ativo9router ? { texto: "9router", tom: "ok" } : { texto: "desligada" });
  }, [aoResumir, ativo9router, dados]);

  function mostrarFeedbackConexao(fb: FeedbackConexao, autoLimpar = false) {
    clearTimeout(timerConexao.current);
    setFeedbackConexao(fb);
    if (autoLimpar && fb) {
      timerConexao.current = setTimeout(() => setFeedbackConexao(null), 2500);
    }
  }

  function mostrarFeedbackLinha(funcao: FuncaoIA, fb: FeedbackLinha, autoLimpar = false) {
    clearTimeout(timersLinha.current[funcao]);
    setFeedbackLinha((prev) => ({ ...prev, [funcao]: fb }));
    if (autoLimpar && fb) {
      timersLinha.current[funcao] = setTimeout(() => {
        setFeedbackLinha((prev) => ({ ...prev, [funcao]: null }));
      }, 2500);
    }
  }

  async function atualizarListaAposConexao() {
    const seq = ++listaSeqRef.current;
    setAtualizandoLista(true);
    try {
      const atualizada = await pedirJson<RespostaModelos>("/api/config/modelos");
      if (seq !== listaSeqRef.current) return;
      definir((atual) =>
        atual
          ? {
              ...atual,
              combos: atualizada.combos,
              fala: atualizada.fala,
              erroLista: atualizada.erroLista,
            }
          : atualizada,
      );
    } catch (e) {
      if (seq === listaSeqRef.current) {
        definir((atual) => (atual ? { ...atual, erroLista: mensagemDe(e) } : null));
      }
    } finally {
      if (seq === listaSeqRef.current) setAtualizandoLista(false);
    }
  }

  async function testarConexao() {
    if (!dados) return;
    const validacao = validarUrl(urlInput);
    if (!validacao.ok) {
      setErroUrl(validacao.erro);
      return;
    }
    const chaveTrim = chaveInput.trim();
    if (trocandoChave && !chaveTrim) {
      setErroChave("Digite a nova chave para testar ou clique em Cancelar.");
      return;
    }

    setErroUrl(null);
    setErroChave(null);
    setFeedbackConexao(null);
    setTesteConexao(null);
    setTestandoConexao(true);
    try {
      const corpo: PedidoTestar = { baseUrl: validacao.url };
      if (chaveTrim) corpo.chave = chaveTrim;
      const res = await chamarTestar(corpo);
      if (res.ok) {
        setTesteConexao({ ok: true, combos: res.combos, ms: res.ms });
      } else {
        setTesteConexao({ ok: false, erro: res.erro ?? "Não foi possível conectar ao 9router." });
      }
    } catch (e) {
      setTesteConexao({ ok: false, erro: mensagemDe(e) });
    } finally {
      setTestandoConexao(false);
    }
  }

  async function salvarConexao() {
    if (!dados) return;
    const validacao = validarUrl(urlInput);
    if (!validacao.ok) {
      setErroUrl(validacao.erro);
      return;
    }
    const chaveTrim = chaveInput.trim();
    const urlSalva = normalizarUrl(dados.baseUrl || URL_9ROUTER_PADRAO);
    if (trocandoChave && !chaveTrim && validacao.url === urlSalva) {
      setErroChave("Digite a nova chave ou clique em Cancelar.");
      return;
    }
    if (!dados.temChave && !chaveTrim && validacao.url === urlSalva) {
      setErroChave("Informe a chave do 9router.");
      return;
    }

    setErroUrl(null);
    setErroChave(null);
    setTesteConexao(null);
    setFeedbackConexao(null);
    setSalvandoConexao(true);
    try {
      const corpo: PedidoSalvarModelos = { baseUrl: validacao.url };
      if (chaveTrim) corpo.chave = chaveTrim;

      const resp = await pedirJson<ConfigModelosPublica & Partial<RespostaModelos>>("/api/config/modelos", {
        corpo,
      });
      setChaveInput("");
      setTrocandoChave(false);
      setUrlInput(resp.baseUrl || validacao.url);
      setTesteLinha({});
      definir((atual) =>
        atual
          ? {
              ...atual,
              ...resp,
              combos: resp.combos ?? atual.combos,
              fala: resp.fala ?? atual.fala,
              erroLista: "erroLista" in resp ? resp.erroLista : atual.erroLista,
            }
          : null,
      );
      mostrarFeedbackConexao({ tom: "ok", texto: "Conexão salva" }, true);
      void atualizarListaAposConexao();
    } catch (e) {
      mostrarFeedbackConexao({ tom: "erro", texto: mensagemDe(e) });
    } finally {
      setSalvandoConexao(false);
    }
  }

  async function removerChave() {
    setErroChave(null);
    setTesteConexao(null);
    setFeedbackConexao(null);
    setRemovendoChave(true);
    try {
      const resp = await pedirJson<ConfigModelosPublica & Partial<RespostaModelos>>("/api/config/modelos", {
        corpo: { chave: "" },
      });
      setChaveInput("");
      setTrocandoChave(false);
      setTesteLinha({});
      definir((atual) =>
        atual
          ? {
              ...atual,
              ...resp,
              combos: resp.combos ?? [],
              fala: resp.fala ?? [],
              erroLista: "erroLista" in resp ? resp.erroLista : undefined,
            }
          : null,
      );
      mostrarFeedbackConexao({ tom: "ok", texto: "Chave removida" }, true);
      void atualizarListaAposConexao();
    } catch (e) {
      mostrarFeedbackConexao({ tom: "erro", texto: mensagemDe(e) });
    } finally {
      setRemovendoChave(false);
    }
  }

  async function aoTrocarModelo(funcao: FuncaoIA, novoValor: string) {
    if (!dados) return;
    const valorAnterior = dados.funcoes[funcao];
    const proximo = novoValor || undefined;

    setTesteLinha((prev) => ({ ...prev, [funcao]: null }));
    setFeedbackLinha((prev) => ({ ...prev, [funcao]: null }));
    setSalvandoLinha((prev) => ({ ...prev, [funcao]: true }));
    definir((atual) => (atual ? { ...atual, funcoes: comFuncao(atual.funcoes, funcao, proximo) } : null));

    try {
      const resp = await pedirJson<ConfigModelosPublica & Partial<RespostaModelos>>("/api/config/modelos", {
        corpo: { funcoes: { [funcao]: novoValor === "" ? null : novoValor } } satisfies PedidoSalvarModelos,
      });
      definir((atual) =>
        atual
          ? {
              ...atual,
              baseUrl: resp.baseUrl,
              temChave: resp.temChave,
              chaveFinal: resp.chaveFinal,
              funcoes: comFuncao(atual.funcoes, funcao, resp.funcoes?.[funcao]),
              combos: resp.combos ?? atual.combos,
              fala: resp.fala ?? atual.fala,
            }
          : null,
      );
      mostrarFeedbackLinha(funcao, { tom: "ok", texto: "Salvo" }, true);
    } catch (e) {
      definir((atual) => (atual ? { ...atual, funcoes: comFuncao(atual.funcoes, funcao, valorAnterior) } : null));
      mostrarFeedbackLinha(funcao, { tom: "erro", texto: mensagemDe(e) });
    } finally {
      setSalvandoLinha((prev) => ({ ...prev, [funcao]: false }));
    }
  }

  async function testarFuncao(funcao: FuncaoIA) {
    setTesteLinha((prev) => ({ ...prev, [funcao]: null }));
    setTestandoLinha((prev) => ({ ...prev, [funcao]: true }));
    try {
      const res = await chamarTestar({ funcao });
      if (res.ok) {
        setTesteLinha((prev) => ({ ...prev, [funcao]: { ok: true, ms: res.ms } }));
      } else {
        setTesteLinha((prev) => ({ ...prev, [funcao]: { ok: false, erro: res.erro ?? "Falha ao testar modelo." } }));
      }
    } catch (e) {
      setTesteLinha((prev) => ({ ...prev, [funcao]: { ok: false, erro: mensagemDe(e) } }));
    } finally {
      setTestandoLinha((prev) => ({ ...prev, [funcao]: false }));
    }
  }

  const ocupadoConexao = salvandoConexao || removendoChave || testandoConexao;
  const urlAtual = normalizarUrl(urlInput);
  const urlSalva = normalizarUrl(dados?.baseUrl || URL_9ROUTER_PADRAO);
  const conexaoAlterada = Boolean(dados && (urlAtual !== urlSalva || chaveInput.trim().length > 0));

  return (
    <Card
      id="modelos"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Modelos de IA"
      icone={<Icone nome="spark" />}
      acoes={
        dados ? (
          <Badge variant={ativo9router ? "ok" : "neutral"} dot={ativo9router}>
            {ativo9router ? "9router" : "Desligada"}
          </Badge>
        ) : undefined
      }
      rodape={
        dados ? (
          <span>
            Sem modelo escolhido a função fica desligada — nada vai para a OpenRouter nem para outros provedores sem você escolher aqui. Sem fallback automático se o 9router falhar.
          </span>
        ) : undefined
      }
    >
      {erro ? (
        <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />
      ) : !dados ? (
        <Carregando linhas={4} rotulo="Carregando os modelos de IA…" />
      ) : (
        <>
          <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-fg-dim">
            Escolha qual combo do 9router cada IA do painel usa. A chave fica salva só no servidor e nunca volta para o navegador.
          </p>

          {/* Bloco Conexão */}
          <div className="mt-4 rounded-control border border-line bg-surface-2/60 p-4">
            <div className="grid grid-cols-2 gap-4 max-[860px]:grid-cols-1">
              <Field label="URL do 9router" htmlFor="modelos-url" error={erroUrl ?? undefined}>
                <Input
                  id="modelos-url"
                  type="url"
                  value={urlInput}
                  disabled={ocupadoConexao}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setErroUrl(null);
                    setTesteConexao(null);
                  }}
                  placeholder={URL_9ROUTER_PADRAO}
                  aria-invalid={Boolean(erroUrl) || undefined}
                  className="font-mono text-[13px]"
                />
              </Field>

              {dados.temChave && !trocandoChave ? (
                <Field label="Chave do 9router">
                  <div className="flex min-h-[34px] flex-wrap items-center justify-between gap-2 rounded-control border border-line-2 bg-surface px-3 py-1">
                    <span className="text-[13px] text-fg-dim">
                      {dados.chaveFinal ? (
                        <>
                          Chave configurada, termina em{" "}
                          <code className="font-mono text-[12.5px] text-fg">••••{dados.chaveFinal}</code>
                        </>
                      ) : (
                        "Chave configurada"
                      )}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="subtle"
                        disabled={ocupadoConexao}
                        onClick={() => {
                          setTrocandoChave(true);
                          setChaveInput("");
                          setErroChave(null);
                        }}
                      >
                        Trocar chave
                      </Button>
                      <BotaoConfirmar
                        variante="ghost"
                        pergunta="Remover a chave salva?"
                        confirmar="Remover chave"
                        disabled={ocupadoConexao}
                        aoConfirmar={removerChave}
                      >
                        Remover
                      </BotaoConfirmar>
                    </div>
                  </div>
                </Field>
              ) : (
                <Field
                  label={trocandoChave ? "Nova chave do 9router" : "Chave do 9router"}
                  htmlFor="modelos-chave"
                  error={erroChave ?? undefined}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      id="modelos-chave"
                      type="password"
                      autoComplete="off"
                      value={chaveInput}
                      disabled={ocupadoConexao}
                      onChange={(e) => {
                        setChaveInput(e.target.value);
                        setErroChave(null);
                        setTesteConexao(null);
                      }}
                      placeholder={trocandoChave ? "Cole a nova chave" : "Cole a chave do 9router"}
                      aria-invalid={Boolean(erroChave) || undefined}
                      className="min-w-0 flex-1 font-mono text-[13px]"
                    />
                    {trocandoChave && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ocupadoConexao}
                        onClick={() => {
                          setTrocandoChave(false);
                          setChaveInput("");
                          setErroChave(null);
                          setTesteConexao(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </Field>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="subtle"
                loading={testandoConexao}
                disabled={salvandoConexao || removendoChave}
                onClick={() => void testarConexao()}
              >
                Testar conexão
              </Button>
              <Button
                size="sm"
                variant={conexaoAlterada ? "primary" : "subtle"}
                loading={salvandoConexao}
                disabled={testandoConexao || removendoChave}
                onClick={() => void salvarConexao()}
              >
                Salvar conexão
              </Button>
              <span aria-live="polite" className="min-w-0 max-w-full break-words text-[12.5px]">
                {feedbackConexao?.tom === "ok" && (
                  <span className="inline-flex items-center gap-1 text-ok">
                    <Icone nome="check" tamanho={14} />
                    <span>{feedbackConexao.texto}</span>
                  </span>
                )}
                {feedbackConexao?.tom === "erro" && <span className="text-danger">{feedbackConexao.texto}</span>}
                {testeConexao?.ok && (
                  <span className="inline-flex items-center gap-1 text-ok">
                    <Icone nome="check" tamanho={14} />
                    <span>
                      Conexão ok
                      {typeof testeConexao.combos === "number" && (
                        <>
                          {" · "}
                          <span className="font-mono tabular-nums">{testeConexao.combos}</span>{" "}
                          {testeConexao.combos === 1 ? "combo" : "combos"}
                        </>
                      )}
                      {typeof testeConexao.ms === "number" && (
                        <>
                          {" · "}
                          <span className="font-mono tabular-nums">{testeConexao.ms}</span> ms
                        </>
                      )}
                    </span>
                  </span>
                )}
                {testeConexao && !testeConexao.ok && <span className="text-danger">{testeConexao.erro}</span>}
              </span>
            </div>
          </div>

          {!dados.temChave && (
            <Aviso tom="info" className="mt-4">
              Salve a chave do 9router para escolher modelos.
            </Aviso>
          )}

          {atualizandoLista && (
            <p aria-live="polite" className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-fg-faint">
              <Spinner className="h-3 w-3" />
              Atualizando lista de modelos…
            </p>
          )}

          {dados.erroLista && !atualizandoLista && (
            <Aviso
              tom="erro"
              className="mt-4"
              acoes={
                <Button size="sm" variant="subtle" onClick={() => void atualizarListaAposConexao()}>
                  Atualizar lista
                </Button>
              }
            >
              Não deu para listar os modelos do 9router: {dados.erroLista}
            </Aviso>
          )}

          {/* Tabela de funções */}
          <ul className="mt-4 border-t border-line">
            {FUNCOES.map((f) => {
              const valorAtual = dados.funcoes[f.id] ?? "";
              const listaBase = (f.tipo === "fala" ? dados.fala : dados.combos) ?? [];
              const foraDaLista = Boolean(valorAtual && !listaBase.includes(valorAtual));
              const salvando = Boolean(salvandoLinha[f.id]);
              const testando = Boolean(testandoLinha[f.id]);
              const fb = feedbackLinha[f.id];
              const resultado = testeLinha[f.id];
              const selectId = `modelos-funcao-${f.id}`;

              return (
                <li key={f.id} className="border-b border-line py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 basis-[260px]">
                      <label htmlFor={selectId} className="block text-[13.5px] font-medium text-fg">
                        {f.rotulo}
                      </label>
                      <p className="mt-0.5 text-[12px] text-fg-faint">
                        {valorAtual ? `9router: ${valorAtual}` : "Sem modelo escolhido: função desligada"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 max-[860px]:w-full">
                      <Select
                        id={selectId}
                        tamanho="sm"
                        value={valorAtual}
                        disabled={!dados.temChave || salvando || testando}
                        onChange={(e) => void aoTrocarModelo(f.id, e.target.value)}
                        className="min-w-[210px] max-[860px]:min-w-0 max-[860px]:flex-1"
                      >
                        <option value="">Desligada</option>
                        {foraDaLista && (
                          <option value={valorAtual}>
                            {listaBase.length > 0 ? `${valorAtual} (fora da lista)` : valorAtual}
                          </option>
                        )}
                        {listaBase.map((modelo) => (
                          <option key={modelo} value={modelo}>
                            {modelo}
                          </option>
                        ))}
                      </Select>
                      <Button
                        size="sm"
                        variant="subtle"
                        loading={testando}
                        disabled={!dados.temChave || !valorAtual || salvando}
                        title={
                          !dados.temChave
                            ? "Salve a chave do 9router para testar"
                            : !valorAtual
                              ? "Escolha um modelo do 9router para testar"
                              : undefined
                        }
                        onClick={() => void testarFuncao(f.id)}
                      >
                        Testar
                      </Button>
                    </div>
                  </div>

                  {(salvando || fb || resultado) && (
                    <div aria-live="polite" className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                      {salvando && <span className="text-fg-faint">Salvando…</span>}
                      {!salvando && fb?.tom === "ok" && (
                        <span className="inline-flex items-center gap-1 text-ok">
                          <Icone nome="check" tamanho={13} />
                          <span>{fb.texto}</span>
                        </span>
                      )}
                      {!salvando && fb?.tom === "erro" && <span className="min-w-0 break-words text-danger">{fb.texto}</span>}
                      {resultado?.ok && (
                        <span className="inline-flex items-center gap-1 text-ok">
                          <Icone nome="check" tamanho={13} />
                          <span>
                            OK
                            {typeof resultado.ms === "number" && (
                              <>
                                {" · "}
                                <span className="font-mono tabular-nums">{resultado.ms}</span> ms
                              </>
                            )}
                          </span>
                        </span>
                      )}
                      {resultado && !resultado.ok && <span className="min-w-0 break-words text-danger">{resultado.erro}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
