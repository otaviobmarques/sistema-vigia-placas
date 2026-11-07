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
| M3 Monitoramento por frequência (diária…mensal, adaptativa), "Consultar agora" com franquia, desligamento automático de fonte | `src/lib/services/monitoramento.ts`, `/api/cron/monitoramento` |
| M4 Faça hoje (até 10 ações) e Caixa de Multas com filtros e ações em massa | `/hoje`, `/multas` |
| M5 Radar de Desconto e recomendação por regras | `src/lib/domain/acoes.ts`, `/multas/[id]` |
| M6 Indicação assistida com link de aceite e CNH | `/multas/[id]`, `/condutor/[token]` |
| M7 Carrinho com Pix único, Pague Contas, contingência Celcoin, crédito em falha | `/pagamentos`, `src/lib/services/pagamentos.ts` |
| M8 Planos, faturas mensais, saving sobre economia comprovada, teto, splits | `/financeiro`, `src/lib/services/faturamento.ts` |
| M9 Extrato de Economia (comprovado × estimado, ROI, PDF pela impressão) | `/extrato` |
| M10 Alertas D-15/7/3/1 sem repetição + escalonamento ao franqueado | `dispararAvisos()` → tabela `outbox` |
| M11 Captura de notificação (foto/PDF/e-mail) e mapa de cobertura | `/enviar`, `/backoffice?aba=cobertura` |
| M12 Defesa como serviço (pedido, protocolo, deferida → economia por cancelamento) | `/multas/[id]`, `/backoffice?aba=defesas` |
| M15 Painel do franqueado · M16 Backoffice · M17 PWA (manifest + navegação inferior) | `/carteira`, `/backoffice`, `src/app/manifest.ts` |

Regras do CTB automatizadas (art. 257 §7º e §8º, 258, 261, 281, 284) ficam em `src/lib/domain/ctb.ts`, com testes que reproduzem os números das telas desenhadas (R$ 130,16 → R$ 104,13 / R$ 78,10; NIC R$ 390,46; carrinho R$ 338,41 com R$ 117,14 de economia; simulação 12.3 do saving). Dinheiro é sempre inteiro em centavos.

## Integrações: real × simulado

Cada integração tem cliente real e entra em **modo simulado** quando falta a chave. O backoffice avisa quando está simulando.

| Integração | Sem chave | Com chave |
|---|---|---|
| Infosimples (`INFOSIMPLES_TOKEN`) | Multas determinísticas por placa | `POST /api/v2/consultas/{serviço}`. **Confirmar o serviço e o formato do retorno** com a primeira resposta real; o normalizador aceita os nomes de campo mais comuns. |
| Asaas (`ASAAS_API_KEY`) | Pix BR Code válido + botão "simular confirmação" | Cobrança Pix com `split` por `walletId`, QR Code, Pague Contas (`/bill`) e webhook em `/api/webhooks/asaas` (header `asaas-access-token` = `ASAAS_WEBHOOK_TOKEN`) |
| Celcoin | Simulada | Pendente de proposta comercial |
| WhatsApp / e-mail / push | Mensagens vão para a fila `outbox` (visível no backoffice) | Falta o despachante (WhatsApp Cloud API + e-mail transacional) |

## Produção (Vercel + Supabase)

1. **Banco:** projeto Supabase com as migrações de `db/migrations/` aplicadas. O app aplica sozinho as que faltarem na primeira requisição.
2. **Vercel:** defina `DATABASE_URL` com a connection string do **Transaction pooler** do Supabase (Project Settings › Database › Connection string, porta 6543). Defina também `APP_URL` e, quando houver, as chaves das integrações.
   - `SESSION_SECRET` é opcional: sem ela, a chave de sessão é derivada da `DATABASE_URL`, e trocar a senha do banco encerra as sessões.
   - `CRON_SECRET` liga a varredura diária do `vercel.json` (06:17, horário de Brasília). Sem ela, a varredura roda pelo botão no backoffice.
3. **Primeiro acesso:** sem administrador cadastrado, `/login` leva a `/primeiro-acesso`, que cria o administrador da franqueadora e depois se fecha.
4. **Asaas:** aponte o webhook para `{APP_URL}/api/webhooks/asaas` e defina `ASAAS_WEBHOOK_TOKEN`.

O login aceita e-mail ou nome de usuário. Cada usuário troca a própria senha em **Minha conta**.

**Isolamento:** toda tela roda numa transação com `SET LOCAL ROLE vigia_app` e as variáveis `app.nivel`, `app.franqueado_id` e `app.cliente_id`. As políticas de RLS fazem o banco devolver só o ramo do usuário (franqueadora → franqueado → cliente). Webhooks, login e varredura usam o contexto de sistema.

## Pendências (dependem de decisão ou de terceiros)

- **Preços:** os planos vêm com valores de partida editáveis (R$ 5,90 / 9,90 / 29,90), além de saving de 20%, taxa de conveniência de R$ 4,90 e defesa a R$ 149,00. Fechar após as cotações (seção 19).
- **Revisão jurídica** do texto legal, dos termos de uso e do fluxo de pagamento (enquadramento como instituição de pagamento).
- **Não implementado no MVP:** OCR automático (hoje a captura pede conferência manual dos campos), login com Google, preenchimento de CNPJ pela Receita, despachante de WhatsApp/e-mail, PDF do extrato gerado no servidor (hoje é via impressão), aprovação dupla (o valor fica salvo, mas ainda não bloqueia o pagamento) e itens da fase 2 e 3 (M13, M14, M18).
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
