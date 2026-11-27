"use client";

import { useEffect, useState } from "react";
import { pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Card, Field, Icone, Select, Toggle } from "@/app/components/ui";
import type { DiaSemana, ExpedienteWebConfig } from "@/lib/expediente-comum";
import { Carregando, FalhaAoCarregar, RodapeSalvar, useSalvar } from "./partes";
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

const FUSOS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Rio_Branco",
  "UTC",
];

export function ExpedienteCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar, definir } = useCarregar<ExpedienteWebConfig>("/api/expediente");
  const [form, setForm] = useState<ExpedienteWebConfig | null>(null);
  const [salvo, setSalvo] = useState<ExpedienteWebConfig | null>(null);
  const salvar = useSalvar();

  useEffect(() => {
    if (!dados) return;
    setForm(dados);
    setSalvo(dados);
  }, [dados]);

  useEffect(() => {
    if (!form) return;
    aoResumir("expediente", {
      texto: form.ativo ? "ativo" : "desligado",
      tom: form.ativo ? "ok" : undefined,
    });
  }, [form, aoResumir]);

  async function aoSalvar(override?: ExpedienteWebConfig): Promise<boolean> {
    const payload = override ?? form;
    if (!payload) return false;
    return salvar.rodar(async () => {
      const res = await pedirJson<{ ok: boolean; config: ExpedienteWebConfig }>("/api/expediente", { corpo: payload });
      definir(res.config);
      setForm(res.config);
      setSalvo(res.config);
    });
  }

  async function alternarAtivo(v: boolean) {
    if (!form) return;
    const anterior = form;
    const prox = { ...form, ativo: v };
    setForm(prox);
    const ok = await aoSalvar(prox);
    if (!ok) setForm(anterior);
  }

  const fusos =
    form && !FUSOS.includes(form.timezone) ? [...FUSOS, form.timezone] : FUSOS;
  const alterado = Boolean(form && salvo && JSON.stringify(form) !== JSON.stringify(salvo));

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
            onChange={(v: boolean) => void alternarAtivo(v)}
            disabled={salvar.salvando}
            aria-label="Ativar horário comercial"
          />
        )
      }
      rodape={
        form ? (
          <RodapeSalvar
            info="Controla o represamento das entregas humanizadas da IA fora do expediente."
            estado={salvar.estado}
            erro={salvar.erro}
            alterado={alterado}
            aoSalvar={() => void aoSalvar()}
            rotulo="Salvar horário"
          />
        ) : undefined
      }
    >
      <p className="mb-3 text-[12.5px] text-fg-dim">
        Define o horário de funcionamento e, se ligado, represa as entregas humanizadas da IA até a próxima abertura.
      </p>
      {erro && <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />}
      {!form && !erro && <Carregando />}
      {form && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fuso horário" htmlFor="exp-tz">
              <Select
                id="exp-tz"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              >
                {fusos.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end pb-1.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-fg">
                <Toggle
                  checked={Boolean(form.segurarEnvios)}
                  onChange={(v) => setForm({ ...form, segurarEnvios: v })}
                  aria-label="Segurar entregas humanizadas da IA até a próxima abertura"
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
                    <label className="flex w-28 cursor-pointer items-center gap-2 font-medium text-fg">
                      <Toggle
                        checked={ligado}
                        onChange={(v) => {
                          const nextDias = { ...form.dias };
                          if (v) nextDias[d.id] = ["08:00", "18:00"];
                          else delete nextDias[d.id];
                          setForm({ ...form, dias: nextDias });
                        }}
                        aria-label={`${d.rotulo} aberto`}
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
          {/* Recados automáticos ficam ocultos na UI, mas os valores do form seguem no payload ao salvar. */}
        </div>
      )}
    </Card>
  );
}
