import type { Db } from "../db";
import { COMPLEMENTARES, consultarMultas, erroDeConta, FONTES, infosimplesCobreUf, modoSimulado } from "../integrations/infosimples";
import { consultarDirectData, directDataAtiva, SERVICO_DIRECTDATA } from "../integrations/directdata";

function nomeFonte(servico: string) {
  if (servico === "simulado") return "Infosimples";
  if (servico === SERVICO_DIRECTDATA) return "Direct Data · Radar Serpro";
  return `Infosimples · ${FONTES.find((f) => f.servico === servico)?.nome ?? servico}`;
}
import { enfileirar } from "../integrations/mensagens";
import { despacharOutbox } from "./despacho";
import { ehEmail } from "../integrations/email";
import { avisoDevido, emRisco, escolherFontes, proximaConsulta, type EstrategiaFontes, type FonteDados, type Frequencia } from "../domain/monitoramento";
import { hojeISO, dataBR, diasEntre, somarDias } from "../domain/dates";
import { melhorValorHoje, prazoIndicacao, valoresMulta } from "../domain/ctb";
import { brl } from "../domain/money";
import { regra, registrarEvento, SELECT_MULTA, type MultaRow } from "./multas";

const LIMITE_FALHAS = 5;

/** Aviso no app (push) da equipe Vigia Placa quando chega multa nova. Prazo curto vira alerta. */
async function avisarEquipeMultasNovas(db: Db, p: Record<string, any>, novas: number) {
  const hoje = hojeISO();
  const urg = await db.one<{ dias: number | null }>(
    `select min(least(vencimento, case when condutor_id is null and notificada_em is not null then notificada_em + 30 end) - $2::date) as dias
     from multas where placa_id = $1 and criado_em > now() - interval '1 hour' and estado not in ('paga','cancelada')`,
    [p.id, hoje],
  );
  const dias = urg?.dias === null || urg?.dias === undefined ? null : Number(urg.dias);
  const urgente = dias !== null && dias <= 7;
  await enfileirar(db, {
    clienteId: p.cliente_id, canal: "push", destino: "equipe",
    assunto: urgente ? `⚠ Multa nova com prazo em ${dias} dia(s) · ${p.placa}` : `${novas} multa(s) nova(s) · ${p.cliente_nome}`,
    corpo: `${p.cliente_nome} · placa ${p.placa}${urgente ? ". Resolva logo para não perder o desconto ou o prazo de indicação." : "."}`,
    url: `/gestao/multas?novas=1&cliente=${p.cliente_id}`,
  });
}

/**
 * Resumo do dia para a equipe Vigia Placa (no app e por e-mail): multas novas nas últimas 24 h,
 * clientes afetados, prazos em até 7 dias e notificadas sem condutor indicado. Um por dia.
 */
export async function resumoDiarioEquipe(db: Db) {
  const hoje = hojeISO();
  const ja = await db.one("select 1 from outbox where destino = 'equipe' and assunto like 'Resumo do dia%' and criado_em::date = $1::date", [hoje]);
  if (ja) return null;
  const r = await db.one(
    `select
       (select count(*) from multas m join clientes c on c.id = m.cliente_id where m.criado_em > now() - interval '24 hours' and m.estado not in ('paga','cancelada') and c.excluido_em is null) as novas,
       (select count(distinct m.cliente_id) from multas m where m.criado_em > now() - interval '24 hours' and m.estado not in ('paga','cancelada')) as clientes,
       (select coalesce(sum(m.valor),0) from multas m where m.criado_em > now() - interval '24 hours' and m.estado not in ('paga','cancelada')) as valor,
       (select count(*) from multas m join clientes c on c.id = m.cliente_id where m.estado not in ('paga','cancelada') and c.excluido_em is null
          and least(m.vencimento, case when m.condutor_id is null and m.notificada_em is not null then m.notificada_em + 30 end) between $1::date and $1::date + 7) as prazos7,
       (select count(*) from multas m join clientes c on c.id = m.cliente_id where m.estado = 'notificada' and m.condutor_id is null and c.excluido_em is null) as sem_condutor,
       (select count(*) from multas m join clientes c on c.id = m.cliente_id where m.estado not in ('paga','cancelada') and c.excluido_em is null) as abertas`,
    [hoje],
  );
  const n = (k: string) => Number(r?.[k] ?? 0);
  if (!n("novas") && !n("prazos7")) return null;
  const assunto = `Resumo do dia · ${n("novas")} multa(s) nova(s)`;
  const corpo = [
    n("novas") ? `${n("novas")} multa(s) nova(s) em ${n("clientes")} cliente(s), somando ${brl(n("valor"))}.` : "Nenhuma multa nova nas últimas 24 horas.",
    n("prazos7") ? `${n("prazos7")} multa(s) com prazo em até 7 dias.` : null,
    n("sem_condutor") ? `${n("sem_condutor")} notificada(s) sem condutor indicado (risco de multa NIC).` : null,
    `${n("abertas")} multa(s) em aberto no total.`,
  ].filter(Boolean).join("\n");
  await enfileirar(db, { clienteId: null, canal: "push", destino: "equipe", assunto, corpo, url: "/gestao/multas?novas=1" });
  const equipe = await db.q<{ email: string }>("select email from usuarios where nivel = 'franqueadora' and ativo");
  for (const u of equipe) if (ehEmail(u.email)) await enfileirar(db, { clienteId: null, canal: "email", destino: u.email, assunto, corpo, url: "/gestao/multas?novas=1" });
  return { novas: n("novas"), prazos7: n("prazos7") };
}

export async function consultarPlaca(db: Db, placaId: string, opts: { avulsa?: boolean } = {}) {
  const p = await db.one(
    `select p.*, c.frequencia_padrao, c.nome as cliente_nome, c.whatsapp, c.email, c.alertas_canais, c.pagamento_auto, c.pagamento_auto_ate, c.tipo, c.documento
     from placas p join clientes c on c.id = p.cliente_id where p.id = $1`,
    [placaId],
  );
  if (!p) throw new Error("Placa não encontrada");
  // Regra de consulta (backoffice › Regras de consulta): qual fonte consultar e quando usar a reserva.
  const cfg = await db.one<{ estrategia_fontes: EstrategiaFontes; fonte_principal: FonteDados }>("select estrategia_fontes, fonte_principal from configuracao where id = 1");
  const infosimplesLigada = !!(await db.one("select 1 from fontes where id = 'infosimples' and ativa"));
  const ddRow = await db.one<{ ativa: boolean }>("select ativa from fontes where id = 'directdata'");
  const directLigada = directDataAtiva() && (ddRow?.ativa ?? true);
  const disponiveis: FonteDados[] = [...(directLigada ? (["directdata"] as const) : []), ...(infosimplesLigada ? (["infosimples"] as const) : [])];
  if (!disponiveis.length) throw new Error("Nenhuma fonte de dados ativa no backoffice");
  const escolha = escolherFontes({
    estrategia: cfg?.estrategia_fontes ?? "principal_reserva",
    principal: cfg?.fonte_principal ?? "directdata",
    disponiveis,
    infosimplesCobreUf: infosimplesCobreUf(p.uf),
    ultimaFonte: (p.ultima_fonte as FonteDados | null) ?? null,
  });

  // Cada serviço da Infosimples é uma fonte própria: erro em sequência desliga só aquele serviço.
  const desligadas = new Set(
    (await db.q<{ id: string }>("select id from fontes where id like 'infosimples:%' and not ativa")).map((f) => f.id.slice("infosimples:".length)),
  );
  const consultar = (f: FonteDados) =>
    f === "directdata" ? consultarDirectData(p.placa, p.renavam).then((d) => ({ fonte: f, detalhes: [d], simulado: false }))
      : consultarMultas(p.placa, p.renavam, p.uf, { documento: p.documento, desligadas }).then((r) => ({ fonte: f, detalhes: r.detalhes, simulado: r.simulado }));
  let rodadas = await Promise.all(escolha.primeiras.map(consultar));
  const algumaOk = (rs: typeof rodadas) => rs.some((x) => x.detalhes.some((d) => d.ok));
  if (!algumaOk(rodadas) && escolha.reserva) rodadas = [...rodadas, await consultar(escolha.reserva)];
  // DNIT (e outras complementares) rodam sempre: se a Infosimples não entrou nesta consulta, chama só elas.
  const comp = COMPLEMENTARES.filter((s) => !desligadas.has(s));
  if (infosimplesLigada && comp.length && !modoSimulado() && !rodadas.some((x) => x.fonte === "infosimples")) {
    const r = await consultarMultas(p.placa, p.renavam, p.uf, { desligadas, apenas: comp });
    if (r.detalhes.length) rodadas = [...rodadas, { fonte: "infosimples" as const, detalhes: r.detalhes, simulado: false }];
  }
  const fonteUsada = rodadas.find((x) => x.detalhes.some((d) => d.ok))?.fonte ?? null;
  if (fonteUsada) await db.q("update placas set ultima_fonte = $2 where id = $1", [p.id, fonteUsada]);
  const ri = { simulado: rodadas.some((x) => x.simulado), detalhes: rodadas.filter((x) => x.fonte === "infosimples").flatMap((x) => x.detalhes) };
  const dd = rodadas.find((x) => x.fonte === "directdata")?.detalhes[0] ?? null;
  const detalhes = [...(ri?.detalhes ?? []), ...(dd ? [dd] : [])];
  const r = {
    ok: detalhes.some((d) => d.ok),
    simulado: !!ri?.simulado,
    erro: detalhes.filter((d) => !d.ok).map((d) => `${d.servico}: ${d.erro}`).join(" | ") || "Nenhuma fonte respondeu",
    // Cada multa guarda de qual fonte veio (a primeira que a trouxe).
    multas: detalhes.flatMap((d) => d.multas.map((m) => ({ ...m, fonteNome: nomeFonte(d.servico) }))),
  };
  for (const d of detalhes) {
    const fid = d.servico === "simulado" ? "infosimples" : d.servico === SERVICO_DIRECTDATA ? "directdata" : `infosimples:${d.servico}`;
    const info = FONTES.find((x) => x.servico === d.servico);
    if (fid !== "infosimples") {
      await db.q("insert into fontes (id, nome, ativa, prioridade, custo) values ($1,$2,true,1,$3) on conflict (id) do nothing", [
        fid, nomeFonte(d.servico), fid === "directdata" ? 36 : Math.round(((info?.extra ?? 0) + 0.2) * 100),
      ]);
    }
    await db.q(
      "insert into consultas (placa_id, cliente_id, fonte_id, custo, resultado, multas_encontradas, erro, avulsa) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [p.id, p.cliente_id, fid, d.custo, d.ok ? "ok" : "erro", d.multas.length, d.erro ?? null, !!opts.avulsa],
    );
    if (d.ok) await db.q("update fontes set falhas_seguidas = 0 where id = $1", [fid]);
    else if (erroDeConta(d) || /n[aã]o autorizad|token inv/i.test(d.erro ?? "")) await db.q("update fontes set ultima_falha = $2 where id = $1", [fid, `Problema na conta: ${d.erro}`]);
    else {
      await db.q(
        `update fontes set falhas_seguidas = falhas_seguidas + 1, ultima_falha = $2,
           ativa = (falhas_seguidas + 1) < $3, desligada_em = case when (falhas_seguidas + 1) >= $3 then now() else desligada_em end
         where id = $1`,
        [fid, d.erro, LIMITE_FALHAS],
      );
    }
  }
  if (!r.ok) {
    if (p.status === "aguardando") await db.q("update placas set status = 'erro' where id = $1", [p.id]);
    return { ok: false, novas: 0, total: 0, erro: r.erro };
  }

  let novas = 0;
  const vistas = new Set<string>();
  for (const m of r.multas) {
    // A mesma multa pode vir de fontes diferentes com o órgão escrito de outro jeito: o auto na mesma placa identifica.
    const chaveAuto = m.autoInfracao.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (vistas.has(chaveAuto)) continue;
    vistas.add(chaveAuto);
    const existente = await db.one<{ id: string }>(
      "select id from multas where placa_id = $1 and upper(regexp_replace(auto_infracao, '[^A-Za-z0-9]', '', 'g')) = $2",
      [p.id, chaveAuto],
    );
    if (existente) {
      await db.q(
        `update multas set notificada_em = coalesce(notificada_em, $2), vencimento = coalesce($3, vencimento), linha_digitavel = coalesce(linha_digitavel, $4),
           estado = case when estado = 'detectada' and $2::date is not null then 'notificada' else estado end where id = $1`,
        [existente.id, m.notificadaEm, m.vencimento, m.linhaDigitavel],
      );
      continue;
    }
    await db.q("insert into orgaos (id, nome, uf) values ($1,$2,$3) on conflict (id) do nothing", [m.orgaoId, m.orgaoNome, p.uf]);
    const ins = await db.one<{ id: string; nova: boolean }>(
      `insert into multas (placa_id, cliente_id, orgao_id, auto_infracao, codigo_infracao, descricao, gravidade, pontos, valor,
         data_infracao, hora, local, estado, fonte, notificada_em, vencimento, linha_digitavel)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (orgao_id, auto_infracao, codigo_infracao) do update set
         notificada_em = coalesce(multas.notificada_em, excluded.notificada_em),
         vencimento = coalesce(excluded.vencimento, multas.vencimento),
         linha_digitavel = coalesce(excluded.linha_digitavel, multas.linha_digitavel),
         estado = case when multas.estado = 'detectada' and excluded.notificada_em is not null then 'notificada' else multas.estado end
       returning id, (xmax = 0) as nova`,
      [p.id, p.cliente_id, m.orgaoId, m.autoInfracao, m.codigoInfracao, m.descricao, m.gravidade, m.pontos, m.valor,
       m.dataInfracao, m.hora, m.local, m.notificadaEm ? "notificada" : "detectada", m.fonteNome, m.notificadaEm, m.vencimento, m.linhaDigitavel],
    );
    if (ins?.nova) {
      novas++;
      await registrarEvento(db, { multaId: ins.id, clienteId: p.cliente_id, tipo: "detectada", descricao: `Detectada pelo Vigia Placa`, fonte: `${m.fonteNome}${r.simulado ? " (simulado)" : ""}` });
      // Multa nova: o cliente sempre recebe por e-mail (o do cadastro) além dos canais escolhidos; e aparece no portal.
      for (const canal of [...new Set([...(p.alertas_canais as string[]), "email"])]) {
        await enfileirar(db, {
          clienteId: p.cliente_id,
          canal: canal as any,
          destino: canal === "email" ? p.email : canal === "whatsapp" ? p.whatsapp : p.cliente_id,
          assunto: `Opa, multa nova na placa ${p.placa}!`,
          corpo: `${m.descricao} · ${m.orgaoNome} · ${dataBR(m.dataInfracao)}. Valor cheio ${brl(m.valor)}. Abra o Vigia Placa para ver como pagar menos.`,
          url: `/multas/${ins.id}`,
        });
      }
      // Pagamento automático (Configurações › Pagamento): multas com desconto até o valor definido vão para o carrinho.
      if (p.pagamento_auto && p.pagamento_auto_ate && m.vencimento && m.notificadaEm) {
        const nova = await db.one<MultaRow>(`${SELECT_MULTA} where m.id = $1`, [ins.id]);
        const melhor = melhorValorHoje(regra(nova!), hojeISO());
        if (melhor.desconto && melhor.valor <= p.pagamento_auto_ate) {
          await db.q("insert into carrinho_itens (cliente_id, multa_id) values ($1,$2) on conflict do nothing", [p.cliente_id, ins.id]);
        }
      }
    }
  }

  const sit = await db.one<{ ultima: string | null; prazo: string | null }>(
    `select max(data_infracao) as ultima, min(least(vencimento, notificada_em + 30)) as prazo
     from multas where placa_id = $1 and estado not in ('paga','cancelada')`,
    [p.id],
  );
  const hoje = hojeISO();
  const prox = proximaConsulta((p.frequencia ?? p.frequencia_padrao) as Frequencia, hoje, { ultimaMultaEm: sit?.ultima ?? null, proximoPrazo: sit?.prazo ?? null }, hoje);
  await db.q(
    "update placas set ultima_verificacao = now(), proxima_verificacao = $2, status = case when status in ('aguardando','erro') then 'ativa' else status end where id = $1",
    [p.id, prox],
  );
  if (novas > 0) await avisarEquipeMultasNovas(db, p, novas);
  return { ok: true, novas, total: r.multas.length };
}

/** Varredura agendada: consulta as placas vencidas, marca multas vencidas e dispara avisos de prazo. */
export async function varredura(db: Db, limite = 200, opts: { enfileirar?: (ids: string[]) => Promise<unknown>; custoEstimado?: number } = {}) {
  const hoje = hojeISO();
  const devidas = await db.q<{ id: string }>(
    `select id from placas where status in ('ativa','aguardando','erro') and (proxima_verificacao is null or proxima_verificacao <= $1)
       and cliente_id in (select id from clientes where bloqueado_em is null and excluido_em is null)
     order by proxima_verificacao nulls first limit $2`,
    [hoje, limite],
  );
  let novas = 0, erros = 0, adiadas = 0;
  const enfileirar: string[] = [];
  const gastoMes = new Map<string, { gasto: number; teto: number | null }>();
  for (const p of devidas) {
    // Teto de gasto do cliente: atingido, a placa só é consultada se estiver em período de risco; senão fica para daqui a 7 dias.
    const info = await db.one("select pl.cliente_id, c.teto_dados_mensal from placas pl join clientes c on c.id = pl.cliente_id where pl.id = $1", [p.id]);
    if (info?.teto_dados_mensal) {
      if (!gastoMes.has(info.cliente_id)) {
        const g = await db.one("select coalesce(sum(custo),0) as v from consultas where cliente_id = $1 and data >= date_trunc('month', now())", [info.cliente_id]);
        gastoMes.set(info.cliente_id, { gasto: Number(g?.v ?? 0), teto: info.teto_dados_mensal });
      }
      const g = gastoMes.get(info.cliente_id)!;
      if (g.teto !== null && g.gasto >= g.teto) {
        const sit = await db.one("select max(data_infracao) as ultima, min(least(vencimento, notificada_em + 30)) as prazo from multas where placa_id = $1 and estado not in ('paga','cancelada')", [p.id]);
        if (!emRisco({ ultimaMultaEm: sit?.ultima ?? null, proximoPrazo: sit?.prazo ?? null }, hoje)) {
          await db.q("update placas set proxima_verificacao = $2 where id = $1", [p.id, somarDias(hoje, 7)]);
          adiadas++;
          continue;
        }
      }
    }
    if (opts.enfileirar) {
      // A consulta roda em outra execução: conta o custo estimado para o teto do cliente.
      if (info?.teto_dados_mensal && gastoMes.has(info.cliente_id)) gastoMes.get(info.cliente_id)!.gasto += opts.custoEstimado ?? 0;
      enfileirar.push(p.id);
      continue;
    }
    const antes = Number((await db.one("select coalesce(sum(custo),0) as v from consultas where placa_id = $1", [p.id]))?.v ?? 0);
    const r = await consultarPlaca(db, p.id);
    if (info?.teto_dados_mensal && gastoMes.has(info.cliente_id)) {
      const depois = Number((await db.one("select coalesce(sum(custo),0) as v from consultas where placa_id = $1", [p.id]))?.v ?? 0);
      gastoMes.get(info.cliente_id)!.gasto += depois - antes;
    }
    novas += r.novas;
    if (!r.ok) erros++;
  }
  await db.q(
    `update multas set estado = 'vencida' where vencimento < $1
       and estado in ('notificada','condutor_indicado','reconhecida_sne','penalidade')`,
    [hoje],
  );
  if (opts.enfileirar && enfileirar.length) await opts.enfileirar(enfileirar);
  const avisos = await dispararAvisos(db);
  const resumo = await resumoDiarioEquipe(db);
  const despacho = await despacharOutbox(db);
  return { placas: devidas.length, enfileiradas: enfileirar.length, novas, erros, adiadas, avisos, resumo, push: despacho.enviados };
}

export async function dispararAvisos(db: Db) {
  const hoje = hojeISO();
  const multas = await db.q<MultaRow & { alertas_antecedencias: number[]; alertas_canais: string[]; email: string; whatsapp: string; franqueado_email: string | null }>(
    `${SELECT_MULTA.replace("from multas m", ", c.alertas_antecedencias, c.alertas_canais, c.email, c.whatsapp, (select u.email from usuarios u where u.franqueado_id = c.franqueado_id limit 1) as franqueado_email from multas m")}
     where m.estado not in ('paga','cancelada','vencida')`,
  );
  let n = 0;
  for (const m of multas) {
    const enviados = await db.q<{ prazo: string; antecedencia: number }>("select prazo, antecedencia from alertas_enviados where multa_id = $1", [m.id]);
    const v = valoresMulta(regra(m));
    const prazos: Array<{ tipo: string; data: string | null; texto: string }> = [
      { tipo: "vencimento", data: m.vencimento, texto: `vence em {d} dia(s). Pague com desconto` },
    ];
    if (m.tipo_proprietario === "PJ" && !m.condutor_id) {
      prazos.push({ tipo: "indicacao", data: prazoIndicacao(m.notificada_em), texto: `prazo de indicação do condutor termina em {d} dia(s). Sem indicação vem multa NIC de ${brl(v.nic)}` });
    }
    for (const pr of prazos) {
      if (!pr.data) continue;
      const ja = enviados.filter((e) => e.prazo === pr.tipo).map((e) => e.antecedencia);
      const ant = avisoDevido(pr.data, hoje, m.alertas_antecedencias, ja);
      if (ant === null) continue;
      await db.q("insert into alertas_enviados (multa_id, prazo, antecedencia, cliente_id) values ($1,$2,$3,$4) on conflict do nothing", [m.id, pr.tipo, ant, m.cliente_id]);
      const faltam = diasEntre(hoje, pr.data);
      const corpo = `Placa ${m.placa}: ${pr.texto.replace("{d}", String(faltam))}.`;
      for (const canal of m.alertas_canais) {
        await enfileirar(db, { clienteId: m.cliente_id, canal: canal as any, destino: canal === "email" ? m.email : canal === "whatsapp" ? m.whatsapp : m.cliente_id, assunto: `Prazo em ${faltam} dia(s) · ${m.placa}`, corpo, url: `/multas/${m.id}` });
      }
      // Escalonamento: no último aviso, o franqueado também é avisado.
      if (ant <= 1 && m.franqueado_email) {
        await enfileirar(db, { clienteId: m.cliente_id, canal: "email", destino: m.franqueado_email, assunto: `[Escalonamento] ${m.cliente_nome} · ${m.placa}`, corpo });
      }
      n++;
    }
  }
  n += await avisosCondutores(db);
  return n;
}

/** CNH e exame toxicológico a vencer: avisos com 30, 15, 7 e 1 dia de antecedência. */
export async function avisosCondutores(db: Db) {
  const hoje = hojeISO();
  const ANTECEDENCIAS = [30, 15, 7, 1];
  const condutores = await db.q(
    `select c.*, cl.email as cliente_email, cl.nome as cliente_nome, cl.alertas_canais from condutores c join clientes cl on cl.id = c.cliente_id
     where c.ativo and (c.cnh_validade between $1 and $2 or c.toxicologico_validade between $1 and $2)`,
    [hoje, somarDias(hoje, 30)],
  );
  let n = 0;
  for (const c of condutores) {
    for (const [tipo, data, rotulo, titulo] of [["cnh", c.cnh_validade, "a CNH", "da CNH"], ["toxicologico", c.toxicologico_validade, "o exame toxicológico", "do exame toxicológico"]] as const) {
      if (!data) continue;
      const ja = (await db.q<{ antecedencia: number }>("select antecedencia from alertas_condutor where condutor_id = $1 and tipo = $2 and referencia = $3", [c.id, tipo, data])).map((r) => r.antecedencia);
      const ant = avisoDevido(data, hoje, ANTECEDENCIAS, ja);
      if (ant === null) continue;
      await db.q("insert into alertas_condutor (condutor_id, cliente_id, tipo, referencia, antecedencia) values ($1,$2,$3,$4,$5) on conflict do nothing", [c.id, c.cliente_id, tipo, data, ant]);
      const corpo = `${c.nome}: ${rotulo} vence em ${dataBR(data)} (${diasEntre(hoje, data) === 0 ? "hoje" : `em ${diasEntre(hoje, data)} dia(s)`}). Dirigir com o documento vencido é infração gravíssima.`;
      await enfileirar(db, { clienteId: c.cliente_id, canal: "email", destino: c.cliente_email, assunto: `Vencimento ${titulo} · ${c.nome}`, corpo });
      await enfileirar(db, { clienteId: c.cliente_id, canal: "whatsapp", destino: c.whatsapp, assunto: `Vencimento ${titulo}`, corpo });
      if ((c.alertas_canais as string[]).includes("push")) await enfileirar(db, { clienteId: c.cliente_id, canal: "push", destino: c.cliente_id, assunto: `Vencimento ${titulo} · ${c.nome}`, corpo, url: "/condutores" });
      n++;
    }
  }
  return n;
}
