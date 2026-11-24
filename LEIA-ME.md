# Site da Barbearia Marcos Werter

Site + agendamento online, rodando na Vercel com um banco de dados gratuito (Neon/Postgres).

- `public/` — o site (página principal e o painel do Werter em `/painel`)
- `api/` — as funções do agendamento (horários livres, agendar, painel)
- `lib/` — regras da agenda (`lib/config.js` tem tudo que dá para mudar)
- `tests/` — testes automáticos (`npm test`)

## Colocar no ar (uma vez só, ~5 minutos)

1. **Importar na Vercel:** vercel.com → *Add New… → Project* → escolha este repositório do GitHub → *Deploy*.
   Não precisa mudar nenhuma configuração (o `vercel.json` já cuida de tudo).
2. **Criar o banco:** no projeto da Vercel → aba **Storage** → *Create Database* → **Neon (Serverless Postgres)** →
   plano **Free** → região **São Paulo (gru1)** se aparecer → *Connect* ao projeto (marque Production, Preview e Development).
   Isso cria sozinho a variável `DATABASE_URL`. As tabelas são criadas automaticamente no primeiro acesso.
3. **Senha do painel:** projeto → *Settings* → *Environment Variables* → adicionar
   `ADMIN_PASSWORD` = uma senha forte (mínimo 6 caracteres) → *Save*.
4. **Publicar de novo:** aba *Deployments* → nos três pontinhos do último deploy → *Redeploy*
   (variáveis novas só valem depois de um deploy).
5. **Testar:** abra o site, marque um horário de teste, entre em `/painel` com a senha e cancele.

Se o banco não estiver configurado, o site continua funcionando e a área de agendamento mostra o botão
"Agendar pelo WhatsApp" no lugar (ninguém fica sem atendimento).

## Primeira coisa a fazer no painel

Como a agenda é 24h, crie um **bloqueio fixo** para a madrugada em `/painel` → *Bloqueios fixos*
(ex.: todos os dias, 23:00 → 07:00). Assim ninguém marca às 3h da manhã sem o Werter querer.

## Regras da agenda (lib/config.js)

| Regra | Valor |
|---|---|
| Intervalo entre clientes | 1 hora (horários de 30 em 30 min) |
| Janela | próximos 7 dias corridos |
| Antecedência mínima | 30 min no expediente · 3 h fora do expediente |
| Expediente | ter–sex 9h–11h e 14h–18h · sáb 9h–18h |
| Agendamentos futuros por WhatsApp | no máximo 2 |
| Tolerância de atraso | 7 minutos |

Horário duplicado é impossível: o próprio banco tem uma trava (exclusion constraint) que recusa
dois atendimentos a menos de 1 hora um do outro, mesmo que duas pessoas confirmem ao mesmo tempo.

## Domínio próprio

Hoje o endereço usado no SEO é `https://barbearia-marcos-werter.vercel.app`. Se usar outro
(ex.: `barbeariamarcoswerter.com.br`), troque esse endereço em `public/index.html`,
`public/robots.txt` e `public/sitemap.xml`.

## Depois de publicar (SEO)

1. Google Search Console → adicionar o site → enviar `sitemap.xml`.
2. No Perfil da Empresa no Google, colocar o link do site e o link de agendamento (`/#agendar`).
3. Colocar o link do site na bio do Instagram.

## Rodar localmente

```bash
npm install
npm test                      # testes da agenda contra um Postgres em memória
node tests/dev-server.js      # site + API em http://localhost:8790 (senha do painel: werter123)
```
