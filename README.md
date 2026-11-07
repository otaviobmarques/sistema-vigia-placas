# Vigia Placa

**A multa chega antes. O desconto também.**

Plataforma de monitoramento de multas por placa e Renavam, com antecipação de desconto (20% e 40% via SNE), indicação de condutor, pagamento de várias multas com um Pix único (com split ao franqueado) e cobrança pela economia comprovada (saving). Implementa o MVP da *Especificação Técnica e Funcional v2.0*.

## Rodar localmente

```bash
npm install
```

```bash
cp .env.example .env.local   # defina SESSION_SECRET (openssl rand -hex 32)
```

```bash
npm run dev
```

Abra http://localhost:3000. Sem `DATABASE_URL`, o sistema sobe com **Postgres embutido (PGlite)** em `./data/pglite`, aplica as migrações e cria dados de demonstração. Para recomeçar do zero, apague a pasta `data/`.

| Conta (senha `vigia123`) | Nível |
|---|---|
| `carla@transportadora.exemplo` | Cliente PJ (frota) — telas T03 a T11 |
| `joao@exemplo.com.br` | Cliente pessoa física |
| `franqueado@exemplo.com.br` | Franqueado — carteira, importação em lote, comissões |
| `admin@vigiaplaca.com.br` | Franqueadora — backoffice, financeiro, cobertura |

Testes das regras de negócio: `npm test` · checagem de tipos: `npm run typecheck`.

## O que está pronto

| Módulo da especificação | Onde |
|---|---|
| M1 Contas em 3 níveis + RLS, perfis, 2FA (TOTP) | `db/migrations/0002_rls.sql`, `src/lib/auth.ts`, `src/lib/totp.ts` |
| M2 Cadastro, aceite LGPD (data/IP/versão), placas individual e em lote (.xlsx/.csv, multi-cliente), varredura inicial e "dinheiro na mesa" | `/clientes/novo`, `/bem-vindo`, `/placas`, `/placas/importar` |
| M3 Monitoramento por frequência em dias (1 a 60) ou adaptativa, definida só pela franqueadora por cliente, grupo ou placa; regra de fontes e teto mensal de gasto por cliente em Backoffice › Regras de consulta; "Consultar agora" com franquia, desligamento automático de fonte | `src/lib/services/monitoramento.ts`, `/api/cron/monitoramento` |
| M4 Faça hoje (até 10 ações) e Caixa de Multas com filtros e ações em massa | `/hoje`, `/multas` |
| M5 Radar de Desconto e recomendação por regras | `src/lib/domain/acoes.ts`, `/multas/[id]` |
| M6 Indicação assistida com link de aceite e CNH | `/multas/[id]`, `/condutor/[token]` |
| M7 Carrinho com Pix único, Pague Contas, contingência Celcoin, crédito em falha | `/pagamentos`, `src/lib/services/pagamentos.ts` |
| M8 Planos, faturas mensais, saving sobre economia comprovada, teto, splits | `/financeiro`, `src/lib/services/faturamento.ts` |
| M9 Extrato de Economia (comprovado × estimado, ROI, PDF pela impressão) | `/extrato` |
| M10 Alertas D-15/7/3/1 sem repetição + escalonamento ao franqueado | `dispararAvisos()` → tabela `outbox` |
| M11 Captura de notificação (foto/PDF/e-mail) e mapa de cobertura | `/enviar`, `/backoffice?aba=cobertura` |
| M12 Defesa como serviço (pedido, protocolo, deferida → economia por cancelamento) | `/multas/[id]`, `/backoffice?aba=defesas` |
| M1 Gestão de usuários: franqueadora e franqueado criam acessos (senha provisória trocada no 1º login), redefinem senha e desativam; o banco impede criar alguém acima do próprio nível | `/usuarios`, `db/migrations/0006_usuarios_aprovacao.sql` |
| Aprovação dupla: pagamento acima do limite do cliente espera a aprovação de outra pessoa antes do Pix; um mesmo boleto nunca entra em dois pagamentos abertos | `src/lib/services/pagamentos.ts` |
| Cadastro com dados públicos do CNPJ (BrasilAPI) | `src/app/api/cnpj/route.ts` |
| M14 Relatórios por infração, placa, condutor, centro de custo (rateio), órgão, horário e mês, com exportação Excel | `/relatorios`, `src/lib/services/relatorios.ts` |
| M13 Condutores: CNH (categoria e validade), exame toxicológico, pontos de 12 meses somados das multas indicadas, nota 0–100, avisos de vencimento (30/15/7/1 dias), sugestão do condutor principal e alerta quando a indicação leva ao limite do art. 261 | `/condutores`, `src/lib/domain/condutores.ts` |
| M15 Painel do franqueado · M16 Backoffice · M17 PWA (manifest + navegação inferior) | `/carteira`, `/backoffice`, `src/app/manifest.ts` |

Regras do CTB automatizadas (art. 257 §7º e §8º, 258, 261, 281, 284) ficam em `src/lib/domain/ctb.ts`, com testes que reproduzem os números das telas desenhadas (R$ 130,16 → R$ 104,13 / R$ 78,10; NIC R$ 390,46; carrinho R$ 338,41 com R$ 117,14 de economia; simulação 12.3 do saving). Dinheiro é sempre inteiro em centavos.

## Integrações: real × simulado

Cada integração tem cliente real e entra em **modo simulado** quando falta a chave. O backoffice avisa quando está simulando.

| Integração | Sem chave | Com chave |
|---|---|---|
| Infosimples (`INFOSIMPLES_TOKEN`) | Multas determinísticas por placa | Cada placa consulta, em paralelo, a **PRF** (`prf/infracoes`) e a fonte do seu estado que funciona só com placa e Renavam: Detran AL, AM, CE, MA, MS, PA, PI, RR, RJ (com CPF/CNPJ do dono) e MG (`detran/mg/multas-extrato`, a confirmar sem login). SP, PR, BA, DF, GO, RS e SC só têm consultas com login gov.br/certificado: nelas valem a PRF e a captura de notificações. Cada serviço é uma fonte no backoffice (saúde, custo, desligamento automático); "Testar fonte" mostra a resposta crua com uma placa real. Lista completa em `src/lib/integrations/infosimples.ts` |
| Direct Data (`DIRECTDATA_TOKEN`) | Fonte desligada | `ConsultaVeicularMultasRadar`: base nacional do Radar/SNE do Serpro por placa e Renavam (inclui UFs que na Infosimples exigem login, como SP). Usada conforme a regra de fontes (padrão: Direct Data principal e Infosimples só se ela falhar; também há "por UF", "alternar" e "ambas"); a mesma multa vinda das duas é reconhecida pelo número do auto. R$ 0,36 por consulta com sucesso. Nome e documento do proprietário vindos na resposta não são guardados. Confirmar com o fornecedor a base legal do acesso ao Radar |
| Asaas (`ASAAS_API_KEY`) | Pix BR Code válido + botão "simular confirmação" | Cobrança Pix com `split` por `walletId`, QR Code, Pague Contas (`/bill`) e webhook em `/api/webhooks/asaas` (header `asaas-access-token` = `ASAAS_WEBHOOK_TOKEN`) |
| Celcoin | Simulada | Pendente de proposta comercial |
| Claude (`ANTHROPIC_API_KEY`) | Campos preenchidos à mão | Leitura automática da foto/PDF da notificação (tela Enviar) e do CRLV-e (tela Placas) com Claude Haiku 5.5. Saída estruturada e validada; a pessoa confere antes de enviar; limite de 100 leituras/dia por cliente |
| Push (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) | Botão de ativar não aparece | Notificações no celular e no computador (PWA): multa nova, prazos, CNH/toxicológico e Pix confirmado, com link direto para a tela. Enviadas logo após cada ação e na varredura diária. No iPhone, só com o app adicionado à Tela de Início |
| WhatsApp / e-mail | Mensagens ficam na fila `outbox` (visível no backoffice) | Falta o despachante (WhatsApp Cloud API + e-mail transacional) |

## Produção (Vercel + Supabase)

1. **Banco:** projeto Supabase com as migrações de `db/migrations/` aplicadas **antes** de cada deploy (pelo SQL Editor ou pelo conector do Supabase). O usuário do app não altera a estrutura do banco: se faltar alguma migração, o app recusa subir e o erro diz qual. Com `VIGIA_MIGRAR=1` e um usuário dono do schema, ele aplica sozinho.
2. **Vercel:** defina `DATABASE_URL` com a connection string do **Transaction pooler** do Supabase (Project Settings › Database › Connection string, porta 6543). Defina também `APP_URL` e, quando houver, as chaves das integrações.
   - `SESSION_SECRET` é opcional: sem ela, a chave de sessão é derivada da `DATABASE_URL`, e trocar a senha do banco encerra as sessões.
   - `CRON_SECRET` liga a varredura diária do `vercel.json` (06:17, horário de Brasília): consultas, multas vencidas e avisos de prazo, CNH e toxicológico. Sem ela, a varredura roda pelo botão no backoffice.
3. **Primeiro acesso:** sem administrador cadastrado, `/login` leva a `/primeiro-acesso`, que cria o administrador da franqueadora e depois se fecha.
4. **Asaas:** aponte o webhook para `{APP_URL}/api/webhooks/asaas` e defina `ASAAS_WEBHOOK_TOKEN`.

O login aceita e-mail ou nome de usuário. Cada usuário troca a própria senha em **Minha conta**.

**Isolamento:** toda tela roda numa transação com `SET LOCAL ROLE vigia_app` e as variáveis `app.nivel`, `app.franqueado_id` e `app.cliente_id`. As políticas de RLS fazem o banco devolver só o ramo do usuário (franqueadora → franqueado → cliente). Webhooks, login e varredura usam o contexto de sistema.

## Pendências (dependem de decisão ou de terceiros)

- **Preços:** os planos vêm com valores de partida editáveis (R$ 5,90 / 9,90 / 29,90), além de saving de 20%, taxa de conveniência de R$ 4,90 e defesa a R$ 149,00. Fechar após as cotações (seção 19).
- **Revisão jurídica** do texto legal, dos termos de uso e do fluxo de pagamento (enquadramento como instituição de pagamento).
- **Não implementado no MVP:** login com Google, despachante de WhatsApp/e-mail, PDF do extrato gerado no servidor (hoje é via impressão) e itens da fase 3 (M18).
- **Armazenamento de arquivos:** fotos de notificação ficam no banco até 4 MB; em produção, mover para o Supabase Storage. A CNH do condutor registra só o nome do arquivo.

## Estrutura

```
db/migrations/        schema + RLS (Postgres/Supabase)
src/lib/domain/       regras puras (CTB, validações, carrinho, saving, agenda) + testes
src/lib/services/     monitoramento, pagamentos, indicação, defesa, faturamento, importação
src/lib/integrations/ Infosimples, Asaas, Pix (BR Code), Celcoin, mensagens
src/app/(app)/        telas autenticadas · src/app/actions.ts: todas as ações
src/components/       marca (logo, Vigi, placa Mercosul) e UI
docs/telas/           capturas das telas geradas no teste de ponta a ponta
```
