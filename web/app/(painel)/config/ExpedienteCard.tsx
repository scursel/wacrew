"use client";

import { useEffect, useState } from "react";
import { pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Button, Card, Field, Icone, Input, Textarea, Toggle } from "@/app/components/ui";
import type { DiaSemana, ExpedienteWebConfig } from "@/lib/expediente-comum";
import { Carregando, FalhaAoCarregar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

const DIAS: Array<{ id: DiaSemana; rotulo: string }> = [
  { id: "seg", rotulo: "Segunda" },
  { id: "ter", rotulo: "Terça" },
  { id: "qua", rotulo: "Quarta" },
  { id: "qui", rotulo: "Quinta" },
  { id: "sex", rotulo: "Sexta" },
  { id: "sab", rotulo: "Sábado" },
  { id: "dom", rotulo: "Domingo" },
];

export function ExpedienteCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar, definir } = useCarregar<ExpedienteWebConfig>("/api/expediente");
  const [form, setForm] = useState<ExpedienteWebConfig | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!dados) return;
    setForm(dados);
    aoResumir("expediente", {
      texto: dados.ativo ? "ativo" : "desligado",
      tom: dados.ativo ? "ok" : undefined,
    });
  }, [dados, aoResumir]);

  async function salvar(e?: React.FormEvent, override?: ExpedienteWebConfig) {
    e?.preventDefault();
    const payload = override ?? form;
    if (!payload || salvando) return;
    setSalvando(true);
    setStatusMsg(null);
    try {
      const res = await pedirJson<{ ok: boolean; config: ExpedienteWebConfig }>("/api/expediente", { corpo: payload });
      definir(res.config);
      setStatusMsg("Horário comercial salvo.");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card
      id="expediente"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Horário comercial"
      icone={<Icone nome="clock" />}
      acoes={
        form && (
          <Toggle
            checked={form.ativo}
            onChange={(v: boolean) => {
              const prox = { ...form, ativo: v };
              setForm(prox);
              void salvar(undefined, prox);
            }}
            disabled={salvando}
            aria-label="Ativar horário comercial"
          />
        )
      }
    >
      <p className="mb-3 text-[12.5px] text-fg-dim">
        Define a janela de atendimento para cálculo de SLA comercial e recados automáticos.
      </p>
      {erro && <FalhaAoCarregar erro={erro} aoTentar={recarregar} />}
      {!form && !erro && <Carregando />}
      {form && (
        <form onSubmit={(e) => void salvar(e)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fuso horário (IANA)" htmlFor="exp-tz">
              <Input
                id="exp-tz"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                placeholder="America/Sao_Paulo"
              />
            </Field>
            <div className="flex items-end pb-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg">
                <input
                  type="checkbox"
                  checked={Boolean(form.segurarEnvios)}
                  onChange={(e) => setForm({ ...form, segurarEnvios: e.target.checked })}
                />
                Segurar entregas humanizadas da IA até a próxima abertura
              </label>
            </div>
          </div>

          <div className="rounded-control border border-line bg-surface-2 p-3">
            <p className="mb-2 text-[12.5px] font-medium text-fg-dim">Dias e faixas de atendimento</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DIAS.map((d) => {
                const faixa = form.dias[d.id];
                const ligado = Boolean(faixa);
                return (
                  <div key={d.id} className="flex items-center gap-2 rounded-[6px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px]">
                    <label className="flex w-24 cursor-pointer items-center gap-1.5 font-medium text-fg">
                      <input
                        type="checkbox"
                        checked={ligado}
                        onChange={(e) => {
                          const nextDias = { ...form.dias };
                          if (e.target.checked) nextDias[d.id] = ["08:00", "18:00"];
                          else delete nextDias[d.id];
                          setForm({ ...form, dias: nextDias });
                        }}
                      />
                      {d.rotulo}
                    </label>
                    {faixa ? (
                      <>
                        <input
                          type="time"
                          value={faixa[0]}
                          onChange={(e) =>
                            setForm({ ...form, dias: { ...form.dias, [d.id]: [e.target.value, faixa[1]] } })
                          }
                          className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg"
                        />
                        <span className="text-fg-faint">às</span>
                        <input
                          type="time"
                          value={faixa[1]}
                          onChange={(e) =>
                            setForm({ ...form, dias: { ...form.dias, [d.id]: [faixa[0], e.target.value] } })
                          }
                          className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg"
                        />
                      </>
                    ) : (
                      <span className="text-fg-faint">Fechado</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Recado automático dentro do expediente" htmlFor="exp-dentro">
              <Textarea
                id="exp-dentro"
                rows={2}
                value={form.recado_dentro}
                onChange={(e) => setForm({ ...form, recado_dentro: e.target.value })}
              />
            </Field>
            <Field label="Recado automático fora do expediente" htmlFor="exp-fora">
              <Textarea
                id="exp-fora"
                rows={2}
                value={form.recado_fora}
                onChange={(e) => setForm({ ...form, recado_fora: e.target.value })}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-fg-dim">{statusMsg ?? ""}</span>
            <Button type="submit" size="sm" loading={salvando}>
              Salvar horário
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
