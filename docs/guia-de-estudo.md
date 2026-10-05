# Guia de estudo — Balcão (mini-ERP)

## Pitch de 30 segundos
“É um mini-ERP de estoque e vendas. A venda e a baixa de estoque acontecem numa única transação no
Postgres: se um item faltar, nada é gravado, e duas vendas simultâneas do último item nunca deixam o
saldo negativo. Valores são centavos inteiros e cada empresa só enxerga os próprios dados.”

## Onde está cada coisa
| Assunto | Arquivo |
|---|---|
| Tabelas, funções, RLS | `supabase/migrations/20261005000000_erp_schema.sql` |
| Venda (tela + ação) | `src/app/vendas/nova/sale-form.tsx`, `src/app/vendas/actions.ts` |
| Movimentações | `src/app/estoque/` |
| Relatórios e CSV | `src/app/relatorios/`, `src/lib/csv.ts` |
| Dinheiro | `src/lib/money.ts`, `src/lib/cart.ts` |
| Testes de banco | `tests/db/erp.test.ts` |
| Concorrência real | `scripts/concurrency-test.ts` |

## Perguntas prováveis

**“Como você garante que o estoque não fica negativo com vendas simultâneas?”**
`SELECT … FOR UPDATE` nas linhas dos produtos antes de validar: a segunda transação espera a primeira
terminar e então lê o saldo já atualizado. O `check (stock >= 0)` é a última barreira.
Saiba explicar por que só o `check` não basta: ele impede o negativo, mas a mensagem seria um erro
genérico e a validação de vários itens ficaria parcial.

**“E deadlock?”**
Bloqueio sempre na mesma ordem (`order by id`). Explique o cenário A+B × B+A e mostre o teste cruzado.

**“Por que centavos inteiros?”**
`0.1 + 0.2 !== 0.3` em ponto flutuante. Mostre `parseMoneyToCents("19,99") === 1999` e o teste de
10 × R$ 0,10 = R$ 1,00.

**“Por que o preço não vem do navegador?”**
Qualquer valor do cliente pode ser alterado. O servidor usa o preço atual do produto e o congela no item.

**“Como isola as empresas?”**
RLS por `org_id` + FKs compostas `(org_id, id)`. Pergunta de acompanhamento: “e se o código esquecer
um filtro `org_id`?” → a RLS ainda bloqueia; o filtro na aplicação é só para performance/clareza.

**“Por que `DEFERRABLE INITIALLY DEFERRED`?”**
Na exclusão em cascata da organização, as FKs de itens para produtos seriam verificadas no meio da
cascata. Adiando para o commit, a organização inteira pode ser removida, mas um produto isolado com
histórico continua protegido. (Este bug foi encontrado por um teste automatizado.)

**“Por que lógica em PL/pgSQL?”**
Atomicidade e defesa em profundidade (a API do Supabase é acessível do navegador). Contraponto:
mais difícil de depurar — por isso testes de banco com PGlite em todo push.

## Limitações para assumir
Custo = último custo (não médio), receita por produto bruta, sem convites pela interface.

## Exercícios
1. Remova o `order by p.id` do bloqueio e rode `pnpm test:concorrencia` (no Supabase): o que acontece?
2. Implemente custo médio ponderado em `_register_movement` e decida como arredondar (documente!).
3. Adicione um papel “gerente” que cancela vendas mas não edita catálogo — onde mexer?
