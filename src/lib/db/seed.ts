/** Dados de demonstração (só no Postgres embutido, quando o banco está vazio). Espelham as telas da especificação. */
import bcrypt from "bcryptjs";
import type { Db, SistemaFn } from "./index";
import { GRAVIDADES, type Gravidade } from "../domain/ctb";
import { hojeISO, somarDias } from "../domain/dates";
import { aplicarFator } from "../domain/money";
import { gerarCNPJ, gerarCPF, gerarRenavam } from "../domain/validators";

function h(s: string) {
  let x = 7;
  for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return x;
}
const renavam = (placa: string) => gerarRenavam(String(h(placa)).padStart(10, "0"));

export async function semearSeVazio(run: SistemaFn) {
  await run(async (db) => {
    const n = await db.one("select count(*) as n from usuarios");
    if (Number(n!.n) > 0) return;
    await semear(db);
  });
}

async function semear(db: Db) {
  const hoje = hojeISO();
  const d = (n: number) => somarDias(hoje, n);
  const senha = bcrypt.hashSync("vigia123", 10);

  await db.q("insert into configuracao (id) values (1) on conflict do nothing");
  await db.q(`insert into planos (id, nome, frequencia, preco_placa, consultas_avulsas, inclui, whatsapp, pix_unico) values
    ('essencial','Essencial','semanal',590,3,'Faça hoje, prazos, alertas por e-mail, Extrato de Economia',false,false),
    ('profissional','Profissional','adaptativa',990,10,'Essencial + WhatsApp, Pix único, indicação assistida, captura de notificações',true,true),
    ('frota','Frota','diaria',2990,30,'Profissional + centros de custo, relatórios, condutores, prioridade no suporte',true,true)`);
  await db.q(`insert into fontes (id, nome, ativa, prioridade, custo) values
    ('infosimples','Infosimples',true,1,20),
    ('senatran','Consulta Online Senatran (aguardando autorização)',false,2,91),
    ('captura','Captura de notificações',true,9,0)`);
  await db.q(`insert into orgaos (id, nome, uf, esfera, aderente_sne, coberto) values
    ('BHTRANS','BHTrans','MG','municipal',true,true),
    ('DETRAN-MG','Detran-MG','MG','estadual',true,true),
    ('DER-MG','DER-MG','MG','estadual',true,true),
    ('PREF-CONTAGEM','Prefeitura de Contagem','MG','municipal',false,false),
    ('CET-SP','CET São Paulo','SP','municipal',true,true)`);

  const fr = await db.one<{ id: string }>(
    "insert into franqueados (nome, documento, cidade) values ('Franqueado Exemplo','" + gerarCNPJ("334455660001") + "','Belo Horizonte') returning id",
  );
  const F = fr!.id;

  async function cliente(c: { nome: string; tipo: "PF" | "PJ"; doc: string; plano: string; segmento: string; email: string; whatsapp: string; pode?: boolean }) {
    const r = await db.one<{ id: string }>(
      `insert into clientes (franqueado_id, tipo, documento, nome, segmento, email, whatsapp, plano_id, aceite_em, aceite_ip, aceite_versao, franqueado_pode_agir, resp_financeiro)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now() - interval '240 days', '177.10.0.1', '2026-11-v1', $9, $4) returning id`,
      [F, c.tipo, c.doc, c.nome, c.segmento, c.email, c.whatsapp, c.plano, c.pode ?? true],
    );
    return r!.id;
  }
  const T = await cliente({ nome: "Transportadora Exemplo Ltda", tipo: "PJ", doc: gerarCNPJ("112223330001"), plano: "profissional", segmento: "Frota", email: "carla@transportadora.exemplo", whatsapp: "+5531999990001" });
  const A = await cliente({ nome: "Auto Center Exemplo", tipo: "PJ", doc: gerarCNPJ("223344550001"), plano: "essencial", segmento: "Lojista", email: "contato@autocenter.exemplo", whatsapp: "+5531999990002" });
  const L = await cliente({ nome: "Locadora Exemplo", tipo: "PJ", doc: gerarCNPJ("445566770001"), plano: "frota", segmento: "Locadora", email: "frota@locadora.exemplo", whatsapp: "+5531999990003", pode: false });
  const J = await cliente({ nome: "João da Silva", tipo: "PF", doc: gerarCPF("529982247"), plano: "essencial", segmento: "Pessoa física", email: "joao@exemplo.com.br", whatsapp: "+5531999990004" });

  await db.q(
    `insert into usuarios (email, nome, senha_hash, nivel, franqueado_id, cliente_id) values
     ('admin@vigiaplaca.com.br','Equipe Vigia Placa',$1,'franqueadora',null,null),
     ('franqueado@exemplo.com.br','Rafael (Franqueado Exemplo)',$1,'franqueado',$2,null),
     ('carla@transportadora.exemplo','Carla',$1,'cliente',null,$3),
     ('joao@exemplo.com.br','João',$1,'cliente',null,$4)`,
    [senha, F, T, J],
  );

  const condutores: Record<string, string> = {};
  for (const [nome, cpf, pts] of [["Carlos Souza", "11144477735", 9], ["Ana Lima", "22255588846", 4], ["Pedro Rocha", "33366699957", 21]] as const) {
    const r = await db.one<{ id: string }>(
      "insert into condutores (cliente_id, nome, cpf, cnh, whatsapp, pontos_12m, gravissimas_12m) values ($1,$2,$3,$4,$5,$6,$7) returning id",
      [T, nome, cpf, `0${cpf.slice(0, 10)}`, "+55319888800" + cpf[0] + cpf[1], pts, pts > 20 ? 1 : 0],
    );
    condutores[nome] = r!.id;
  }

  async function placa(cli: string, p: string, o: { uf?: string; sne?: string | null; apelido?: string; grupo?: string; cc?: string; modelo?: string; horas?: number } = {}) {
    const r = await db.one<{ id: string }>(
      `insert into placas (cliente_id, placa, renavam, uf, apelido, grupo, centro_custo, modelo, status, sne_adesao_em, ultima_verificacao, proxima_verificacao)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'ativa',$9, now() - ($10 || ' hours')::interval, $11) returning id`,
      [cli, p, renavam(p), o.uf ?? "MG", o.apelido ?? null, o.grupo ?? null, o.cc ?? null, o.modelo ?? null, o.sne === undefined ? "2026-01-10" : o.sne, String(o.horas ?? 3), d(1)],
    );
    return r!.id;
  }

  let seq = 1000;
  async function multa(cli: string, placaId: string, o: {
    orgao: string; desc: string; cod: string; grav: Gravidade; infracao: string; notif?: string | null; venc?: string | null;
    estado?: string; condutor?: string | null; indic?: string | null; local?: string; detect?: string; hora?: string;
  }) {
    const r = await db.one<{ id: string }>(
      `insert into multas (placa_id, cliente_id, orgao_id, auto_infracao, codigo_infracao, descricao, gravidade, pontos, valor, data_infracao, hora, local,
         estado, detectada_em, fonte, notificada_em, vencimento, condutor_id, indicacao_status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
      [placaId, cli, o.orgao, `AI${++seq}${o.cod}`, o.cod, o.desc, o.grav, GRAVIDADES[o.grav].pontos, GRAVIDADES[o.grav].valor, o.infracao, o.hora ?? "14:32",
       o.local ?? "Av. Afonso Pena, 1500", o.estado ?? "notificada", o.detect ?? somarDias(o.infracao, 2), o.orgao === "PREF-CONTAGEM" ? "Captura de notificações" : "Infosimples",
       o.notif ?? null, o.venc ?? null, o.condutor ?? null, o.indic ?? null],
    );
    const id = r!.id;
    await db.q("insert into eventos (multa_id, cliente_id, tipo, descricao, data, fonte) values ($1,$2,'infracao','Infração registrada · ' || $3, $4::date, null)", [id, cli, o.local ?? "Av. Afonso Pena, 1500", o.infracao]);
    await db.q("insert into eventos (multa_id, cliente_id, tipo, descricao, data, fonte) values ($1,$2,'detectada','Detectada pelo Vigia Placa', $3::date, $4)", [id, cli, o.detect ?? somarDias(o.infracao, 2), o.orgao === "PREF-CONTAGEM" ? "Foto da carta enviada pelo cliente" : "consulta Infosimples"]);
    if (o.notif) await db.q("insert into eventos (multa_id, cliente_id, tipo, descricao, data) values ($1,$2,'notificada','Notificação da autuação', $3::date)", [id, cli, o.notif]);
    return id;
  }

  // ---------- Transportadora Exemplo (tela T03) ----------
  const pRST = await placa(T, "RST4E56", { apelido: "Caminhão 04", grupo: "Frota BH", cc: "Logística", modelo: "VW Delivery 9.170" });
  const pABC = await placa(T, "ABC1D23", { apelido: "Fiorino 01", grupo: "Frota BH", cc: "Entregas", modelo: "Fiat Fiorino" });
  const pHJK = await placa(T, "HJK7L89", { apelido: "Caminhão 02", grupo: "Frota BH", cc: "Logística", modelo: "Mercedes Accelo" });
  const pMNO = await placa(T, "MNO2P34", { apelido: "Van 03", grupo: "Frota Contagem", cc: "Entregas", modelo: "Renault Master" });
  const pXYZ = await placa(T, "XYZ9A87", { apelido: "Strada 02", grupo: "Comercial", cc: "Vendas", modelo: "Fiat Strada", sne: null });
  const pQWE = await placa(T, "QWE5R67", { apelido: "Saveiro 01", grupo: "Comercial", cc: "Vendas", modelo: "VW Saveiro", sne: "2026-10-28" });
  const pDFG = await placa(T, "DFG8H90", { apelido: "Caminhão 01", grupo: "Frota BH", cc: "Logística" });
  for (const p of ["KLM3N45", "BRA2E19", "PQR6S78", "TUV1W23", "GHI4J56"]) await placa(T, p, { grupo: "Frota BH", cc: "Logística", horas: 5 });

  await multa(T, pRST, { orgao: "DER-MG", desc: "Excesso de velocidade de 20% a 50%", cod: "7463", grav: "grave", infracao: d(-36), notif: d(-28), venc: d(12), local: "MG-050, km 42" });
  const mABC = await multa(T, pABC, { orgao: "BHTRANS", desc: "Estacionar em local proibido", cod: "5452", grav: "media", infracao: d(-17), notif: d(-8), venc: d(6), estado: "condutor_indicado", condutor: condutores["Ana Lima"], indic: "aceita", detect: d(-15) });
  await multa(T, pHJK, { orgao: "DETRAN-MG", desc: "Avançar sinal vermelho", cod: "6050", grav: "gravissima", infracao: d(-30), notif: d(-23), venc: d(20), local: "Av. do Contorno, 3200" });
  await multa(T, pMNO, { orgao: "PREF-CONTAGEM", desc: "Estacionar em desacordo com a regulamentação", cod: "5541", grav: "media", infracao: d(-60), notif: d(-25), venc: d(12), estado: "condutor_indicado", condutor: condutores["Carlos Souza"], indic: "protocolada", local: "Av. João César de Oliveira, 2100 · Contagem", detect: d(-24) });
  await multa(T, pXYZ, { orgao: "DETRAN-MG", desc: "Excesso de velocidade de 20% a 50%", cod: "7463", grav: "grave", infracao: d(-26), notif: d(-18), venc: d(15), estado: "condutor_indicado", condutor: condutores["Pedro Rocha"], indic: "protocolada", local: "Anel Rodoviário, km 12" });
  await multa(T, pQWE, { orgao: "BHTRANS", desc: "Transitar em faixa exclusiva", cod: "5185", grav: "media", infracao: d(-29), notif: d(-20), venc: d(18), estado: "condutor_indicado", condutor: condutores["Carlos Souza"], indic: "protocolada", local: "Av. Cristiano Machado, 4000" });
  await multa(T, pDFG, { orgao: "BHTRANS", desc: "Parar sobre a faixa de pedestres", cod: "5509", grav: "media", infracao: d(-4), estado: "detectada", detect: d(-2), notif: null, venc: null });
  await db.q("insert into eventos (multa_id, cliente_id, tipo, descricao, data) values ($1,$2,'indicacao_aceita','Ana Lima aceitou a indicação', now() - interval '3 days')", [mABC, T]);

  await db.q(
    `insert into notificacoes_capturadas (cliente_id, origem, arquivo_nome, arquivo_tipo, dados, multa_id, achada_antes, orgao_id)
     select $1, 'foto', 'carta_contagem.jpg', 'image/jpeg', '{"orgao":"Prefeitura de Contagem"}', id, false, 'PREF-CONTAGEM' from multas where placa_id = $2`,
    [T, pMNO],
  );

  // Histórico pago (barras de economia mês a mês)
  const mesAtual = hoje.slice(0, 7);
  const meses: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(Number(mesAtual.slice(0, 4)), Number(mesAtual.slice(5, 7)) - 1 - i, 15));
    meses.push(dt.toISOString().slice(0, 7));
  }
  const historico: Array<[number, Gravidade, "40" | "20" | "nic", string]> = [
    [0, "media", "40", "KLM3N45"], [0, "grave", "nic", "BRA2E19"],
    [1, "grave", "20", "PQR6S78"], [1, "media", "40", "TUV1W23"], [1, "grave", "nic", "GHI4J56"],
    [2, "media", "40", "KLM3N45"], [2, "grave", "nic", "PQR6S78"],
    [3, "gravissima", "20", "TUV1W23"], [3, "grave", "nic", "BRA2E19"], [3, "media", "40", "GHI4J56"],
    [4, "media", "40", "KLM3N45"], [4, "grave", "40", "BRA2E19"], [4, "grave", "nic", "RST4E56"], [4, "grave", "nic", "DFG8H90"], [4, "media", "20", "PQR6S78"],
    [5, "media", "40", "TUV1W23"], [5, "leve", "20", "GHI4J56"],
  ];
  const placaIds = Object.fromEntries((await db.q<{ id: string; placa: string }>("select id, placa from placas where cliente_id = $1", [T])).map((p) => [p.placa, p.id]));
  for (const [i, grav, tipo, pl] of historico) {
    const mes = meses[i];
    const inf = `${mes}-0${(i % 5) + 2}`;
    const valor = GRAVIDADES[grav].valor;
    const id = await multa(T, placaIds[pl], {
      orgao: i % 2 ? "BHTRANS" : "DETRAN-MG", desc: grav === "media" ? "Estacionar em local proibido" : grav === "grave" ? "Excesso de velocidade de 20% a 50%" : grav === "leve" ? "Estacionar afastado da guia" : "Avançar sinal vermelho",
      cod: grav === "media" ? "5452" : grav === "grave" ? "7463" : grav === "leve" ? "5428" : "6050", grav, infracao: somarDias(inf, -10), notif: somarDias(inf, -3), venc: somarDias(inf, 25),
      estado: tipo === "nic" ? "condutor_indicado" : "paga", condutor: tipo === "nic" ? condutores["Carlos Souza"] : null, indic: tipo === "nic" ? "protocolada" : null,
    });
    if (tipo === "nic") {
      await db.q("update multas set estado = 'paga' where id = $1", [id]);
      await db.q("insert into economias (multa_id, cliente_id, tipo, valor, comprovada, mes, descricao, criado_em) values ($1,$2,'nic_evitada',$3,true,$4,$5,$6::date)",
        [id, T, valor * 2, mes, `${pl} · condutor indicado`, inf]);
    } else {
      const pago = aplicarFator(valor, tipo === "40" ? 0.6 : 0.8);
      await db.q("insert into economias (multa_id, cliente_id, tipo, valor, comprovada, mes, descricao, criado_em) values ($1,$2,'desconto',$3,true,$4,$5,$6::date)",
        [id, T, valor - pago, mes, `${pl} · pago com ${tipo}%`, inf]);
    }
  }

  // ---------- Demais clientes da carteira ----------
  const pAuto1 = await placa(A, "LOJ1A23", { apelido: "Seminovo · Onix", grupo: "Vitrine", sne: null });
  for (const p of ["LOJ2B34", "LOJ3C45", "LOJ4D56", "LOJ5E67"]) await placa(A, p, { grupo: "Vitrine", sne: null });
  await multa(A, pAuto1, { orgao: "BHTRANS", desc: "Estacionar em local proibido", cod: "5452", grav: "media", infracao: d(-20), notif: d(-12), venc: d(9) });
  const pLoc = await placa(L, "LOC9Z87", { apelido: "Aluguel 117", grupo: "Pátio Savassi" });
  for (const p of ["LOC1Y11", "LOC2X22", "LOC3W33", "LOC4V44", "LOC5U55", "LOC6T66", "LOC7S77"]) await placa(L, p, { grupo: "Pátio Savassi" });
  await multa(L, pLoc, { orgao: "DETRAN-MG", desc: "Usar celular ao volante", cod: "7366", grav: "gravissima", infracao: d(-27), notif: d(-26), venc: d(14) });
  await multa(L, pLoc, { orgao: "DER-MG", desc: "Excesso de velocidade até 20%", cod: "7455", grav: "media", infracao: d(-12), notif: d(-6), venc: d(30), local: "BR-040, km 520" });
  await placa(J, "JOS1F23", { apelido: "Meu carro" });
  await placa(J, "JOS2G34", { apelido: "Moto", sne: null });

  // Consultas recentes (custos e saúde das fontes no backoffice)
  await db.q(
    `insert into consultas (placa_id, cliente_id, fonte_id, data, custo, resultado, multas_encontradas)
     select p.id, p.cliente_id, 'infosimples', now() - (g || ' days')::interval, 20, 'ok', 0
     from placas p, generate_series(0, 27, 7) g`,
  );
}
