# CRM de Profissionais — Carvalho Pré-Moldados (v1)

CRM interno para construir relacionamento com pedreiros, mestres de obras, engenheiros e arquitetos, e transformar esse relacionamento em vendas de laje.

O vocabulário está em [`GLOSSARY.md`](GLOSSARY.md). As decisões e o motivo de cada uma estão em [`docs/adr/`](docs/adr).

## O que tem na v1

| Tela | Para quê |
|---|---|
| **Agenda** | Com quem falar hoje. Mostra:<br>• recompra: profissional há 60+ dias sem venda (o prazo é ajustável);<br>• contatos agendados;<br>• pós-entrega: confirmar com o Dono da Obra quem é o pedreiro;<br>• obras que ainda não chegaram na laje;<br>• aniversários dos próximos 7 dias (tempo de separar o presente).<br>Cada item tem um botão de WhatsApp e o registro do contato. |
| **Profissionais** | Cadastro com Categoria, gratificação padrão (Fixa ou Percentual), chave PIX, data de nascimento e prazo de recompra próprio. Na ficha de cada um: obras, histórico de contatos e extrato de gratificações. |
| **Obras** | Funil por status: em andamento, orçada, fechada, perdida (com o motivo) ou entregue. Registra o papel do profissional em cada obra (Indicador, Comprador ou Profissional da Obra). |
| **Conciliação** | Fila dos pedidos fechados no app. Liga cada pedido a uma obra, calcula a gratificação e sinaliza valor **divergente** e **profissional omitido**. |
| **Gratificações** | Extrato geral. A gratificação passa de "aguardando" para "a pagar" quando o cliente quita, e de "a pagar" para "paga" com o comprovante do PIX. Só o Gerencial paga, ajusta ou cancela. |
| **Configurações** | Só para o Gerencial: prazos, % padrão, regra do Profissional da Obra e categorias. |

Ficam para a **v2**: o papel *Recomendado* (a fábrica indicar mão de obra) e a Conciliação automática.

## Como instalar

### 1. Banco (Supabase, mesmo projeto do app)
1. No Supabase, abra o **SQL Editor** e rode, em ordem, os arquivos de `supabase/migrations/` (`0001_crm_schema.sql`, `0002_painel_indicacoes_historico.sql`, `0003_aniversario.sql`, `0004_indicacao_geral.sql`). Os scripts podem ser rodados de novo sem estragar nada.
2. Em **Authentication › Users › Add user**, crie os dois usuários (e-mail e senha, marcando *Auto Confirm User*).
3. Rode `supabase/adicionar_operador.sql` uma vez para cada usuário, ajustando o e-mail, o nome e o perfil (`gerencial` ou `operacional`).
4. Em **Authentication › Providers › Email**, se quiser, desligue "Allow new users to sign up". Assim, ninguém de fora cria conta. Mesmo que alguém crie, não vê nada sem estar em `crm_operadores`.

### 2. Site (GitHub Pages)
1. Crie um repositório (por exemplo `crm-profissionais`) e suba esta pasta inteira.
2. Em **Settings › Secrets and variables › Actions**, crie dois segredos:
   - `VITE_SUPABASE_URL` = `https://aewqpdxraiibypqsirxp.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = a *anon public key* (Supabase › Settings › API)
3. Em **Settings › Pages**, escolha **Source: GitHub Actions**.
4. Faça um push na `main`. O workflow `.github/workflows/deploy.yml` gera e publica o site em `https://jeffinc88.github.io/crm-profissionais/`.

> A *anon key* é pública por natureza. Quem protege os dados é o RLS: sem login de operador, o banco não devolve nada.

**No celular:** abra o endereço no Chrome ou no Safari e use "Adicionar à tela inicial". O CRM abre como um app.

**Para rodar no seu PC:** entre em `web/`, copie `.env.example` para `.env`, preencha os dados e rode `npm install` e depois `npm run dev`.

### 3. App comercial
Siga [`integracao-app/INTEGRACAO_APP.md`](integracao-app/INTEGRACAO_APP.md). São três mudanças: a marcação no orçamento, a diluição de "Outras Despesas" no PDF do cliente e o envio dos pedidos fechados para a fila.

## Estrutura

```
GLOSSARY.md                     vocabulário do domínio
docs/adr/                       decisões registradas (0001–0009)
supabase/migrations/            schema, RLS, regras e views
supabase/adicionar_operador.sql liberar acesso a um usuário
supabase/test/                  cenários de teste do banco
web/                            site (Vite + React + supabase-js)
integracao-app/                 mudanças e código para o app comercial
.github/workflows/deploy.yml    publicação no GitHub Pages
```

## Regras que o banco garante (não dependem da tela)
- Quem não é operador não lê nem grava nada do CRM.
- Só o Gerencial altera valores de gratificação, registra pagamento, cancela ou muda as regras.
- A gratificação só pode ser paga depois que o Dono da Obra quitou o pedido.
- O Comprador nunca gera gratificação. O Profissional da Obra só gera se a regra estiver ligada.
- A Gratificação Percentual é calculada sobre os produtos, sem o frete.
- Um pedido não pode ser conciliado duas vezes.
