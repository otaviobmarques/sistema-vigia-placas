import type { Db } from "../db";
import { consultarMultas, erroDeConta, FONTES } from "../integrations/infosimples";
import { enfileirar } from "../integrations/mensagens";
import { despacharOutbox } from "./despacho";
import { avisoDevido, proximaConsulta, type Frequencia } from "../domain/monitoramento";
import { hojeISO, dataBR, diasEntre, somarDias } from "../domain/dates";
import { melhorValorHoje, prazoIndicacao, valoresMulta } from "../domain/ctb";
import { brl } from "../domain/money";
import { regra, registrarEvento, SELECT_MULTA, type MultaRow } from "./multas";

const LIMITE_FALHAS = 5;

export async function consultarPlaca(db: Db, placaId: string, opts: { avulsa?: boolean } = {}) {
  const p = await db.one(
    `select p.*, c.frequencia_padrao, c.nome as cliente_nome, c.whatsapp, c.email, c.alertas_canais, c.pagamento_auto, c.pagamento_auto_ate, c.tipo, c.documento
     from placas p join clientes c on c.id = p.cliente_id where p.id = $1`,
    [placaId],
  );
  if (!p) throw new Error("Placa não encontrada");
  const fonte = await db.one("select * from fontes where id = 'infosimples' and ativa");
  if (!fonte) throw new Error("Fonte Infosimples desligada no backoffice");

  // Cada serviço da Infosimples é uma fonte própria: erro em sequência desliga só aquele serviço.
  const desligadas = new Set(
    (await db.q<{ id: string }>("select id from fontes where id like 'infosimples:%' and not ativa")).map((f) => f.id.slice("infosimples:".length)),
  );
  const r = await consultarMultas(p.placa, p.renavam, p.uf, { documento: p.documento, desligadas });
  for (const d of r.detalhes) {
    const fid = d.servico === "simulado" ? "infosimples" : `infosimples:${d.servico}`;
    const info = FONTES.find((x) => x.servico === d.servico);
    if (fid !== "infosimples") {
      await db.q("insert into fontes (id, nome, ativa, prioridade, custo) values ($1,$2,true,1,$3) on conflict (id) do nothing", [
        fid, `Infosimples · ${info?.nome ?? d.servico}`, Math.round(((info?.extra ?? 0) + 0.2) * 100),
      ]);
    }
    await db.q(
      "insert into consultas (placa_id, cliente_id, fonte_id, custo, resultado, multas_encontradas, erro, avulsa) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [p.id, p.cliente_id, fid, d.custo, d.ok ? "ok" : "erro", d.multas.length, d.erro ?? null, !!opts.avulsa],
    );
    if (d.ok) await db.q("update fontes set falhas_seguidas = 0 where id = $1", [fid]);
    else if (erroDeConta(d)) await db.q("update fontes set ultima_falha = $2 where id = $1", [fid, `Conta Infosimples: ${d.erro}`]);
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
  for (const m of r.multas) {
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
       m.dataInfracao, m.hora, m.local, m.notificadaEm ? "notificada" : "detectada", fonte.nome, m.notificadaEm, m.vencimento, m.linhaDigitavel],
    );
    if (ins?.nova) {
      novas++;
      await registrarEvento(db, { multaId: ins.id, clienteId: p.cliente_id, tipo: "detectada", descricao: `Detectada pelo Vigia Placa`, fonte: `${fonte.nome}${r.simulado ? " (simulado)" : ""}` });
      for (const canal of p.alertas_canais as string[]) {
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
  return { ok: true, novas, total: r.multas.length };
}

/** Varredura agendada: consulta as placas vencidas, marca multas vencidas e dispara avisos de prazo. */
export async function varredura(db: Db, limite = 200) {
  const hoje = hojeISO();
  const devidas = await db.q<{ id: string }>(
    `select id from placas where status in ('ativa','aguardando') and (proxima_verificacao is null or proxima_verificacao <= $1)
     order by proxima_verificacao nulls first limit $2`,
    [hoje, limite],
  );
  let novas = 0, erros = 0;
  for (const p of devidas) {
    const r = await consultarPlaca(db, p.id);
    novas += r.novas;
    if (!r.ok) erros++;
  }
  await db.q(
    `update multas set estado = 'vencida' where vencimento < $1
       and estado in ('notificada','condutor_indicado','reconhecida_sne','penalidade')`,
    [hoje],
  );
  const avisos = await dispararAvisos(db);
  const despacho = await despacharOutbox(db);
  return { placas: devidas.length, novas, erros, avisos, push: despacho.enviados };
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
