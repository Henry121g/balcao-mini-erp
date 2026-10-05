# Projeto 2 — Mini-ERP de estoque e vendas

## Problema
Pequenos comércios controlam estoque em planilhas: o saldo diverge da prateleira, vendas são
registradas sem baixar o estoque, ninguém sabe quando repor e não há histórico de quem mexeu em quê.

## Público
Donos e equipes de pequenos comércios (mercearia, loja de conveniência, papelaria).

## Perfis (por organização)
| Papel | Pode |
|---|---|
| `admin` | Tudo, inclusive cancelar vendas e gerenciar o catálogo |
| `vendedor` | Registrar vendas; consultar produtos, estoque e relatórios |
| `estoquista` | Entradas, saídas, ajustes; cadastrar produtos, categorias e fornecedores |
| `leitura` | Apenas consultar |

Cada usuário pertence a uma ou mais **organizações**; nenhum dado atravessa organizações.
Quem se cadastra recebe uma organização própria (sandbox) com catálogo fictício de exemplo.

## Regras de negócio
- Valores monetários em **centavos inteiros** (`bigint`). Totais calculados no banco por soma de
  inteiros: `total = subtotal − desconto`, sem ponto flutuante.
- Preço e custo são **congelados** no item da venda (relatórios de margem não mudam se o preço mudar).
- O saldo (`products.stock`) **nunca é editado diretamente**: só muda por movimentação
  (entrada, saída, ajuste, venda, estorno), e toda movimentação registra o saldo resultante.
- Saldo nunca negativo: `check (stock >= 0)` + validação com bloqueio de linha.
- Ajuste informa a **contagem física**; o sistema calcula a diferença e exige motivo.
- Venda cancelada (só admin) devolve o estoque com movimentação de **estorno**.
- Número da venda sequencial por organização, sem lacunas.
- Alerta de estoque mínimo quando `stock <= min_stock`.
- Histórico de movimentações imutável (sem update/delete).

## Critério essencial — concorrência e transação
`create_sale` roda numa única transação:
1. bloqueia as linhas dos produtos **em ordem de id** (`SELECT … FOR UPDATE`) — evita deadlock
   entre duas vendas com os mesmos itens em ordens diferentes;
2. valida saldo de todos os itens; se algum faltar, nada é gravado;
3. grava venda, itens, baixa de estoque e movimentações.
Duas vendas simultâneas do último item: uma conclui, a outra recebe “Estoque insuficiente”.

## Critérios de aceite
1. Venda com vários itens baixa o estoque e gera uma movimentação por item, atomicamente.
2. Venda com um item sem saldo não grava nada.
3. Vendas concorrentes nunca deixam saldo negativo (teste com conexões paralelas no Supabase real).
4. Entrada, saída e ajuste atualizam saldo e histórico; saída acima do saldo é recusada.
5. Cancelamento devolve o estoque; só admin cancela; venda cancelada não entra nos relatórios.
6. Relatório por período: faturamento, custo, margem e quantidade, por dia e por produto, no fuso da organização.
7. Alertas de estoque mínimo no painel.
8. Papéis aplicados no banco (RLS e funções); isolamento entre organizações testado.
9. Interface responsiva e acessível, com estados de carregamento, erro, sucesso e vazio.

## Fora do escopo
Nota fiscal, multiloja/multidepósito, pagamentos, importação de XML de compra.
