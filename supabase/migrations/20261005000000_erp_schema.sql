-- Projeto 2 — Mini-ERP de estoque e vendas
-- Schema isolado `erp` (projeto Supabase compartilhado com outras demos; ver PLANO.md do portfólio).
-- Regras críticas no banco: venda transacional, saldo nunca negativo, histórico imutável,
-- valores em centavos inteiros e isolamento por organização.

create schema if not exists erp;

create type erp.member_role as enum ('admin', 'vendedor', 'estoquista', 'leitura');
create type erp.movement_type as enum ('entrada', 'saida', 'ajuste', 'venda', 'estorno_venda');
create type erp.sale_status as enum ('concluida', 'cancelada');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table erp.organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 2 and 80),
  timezone          text not null default 'America/Sao_Paulo',
  last_sale_number  int not null default 0,
  is_sandbox        boolean not null default false,
  created_at        timestamptz not null default now()
);

create table erp.members (
  org_id      uuid not null references erp.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        erp.member_role not null,
  full_name   text not null check (char_length(full_name) between 2 and 100),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on erp.members (user_id);

create table erp.categories (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references erp.organizations (id) on delete cascade,
  name    text not null check (char_length(name) between 2 and 60),
  unique (org_id, id)
);
create unique index categories_org_name on erp.categories (org_id, lower(name));

create table erp.suppliers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references erp.organizations (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 100),
  document    text check (document is null or document ~ '^[0-9./-]{11,18}$'),
  email       text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text check (phone is null or phone ~ '^[0-9 ()+-]{8,20}$'),
  created_at  timestamptz not null default now(),
  unique (org_id, id)
);
create unique index suppliers_org_name on erp.suppliers (org_id, lower(name));

create table erp.products (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references erp.organizations (id) on delete cascade,
  sku          text not null check (sku ~ '^[A-Z0-9-]{2,30}$'),
  name         text not null check (char_length(name) between 2 and 100),
  category_id  uuid,
  supplier_id  uuid,
  price_cents  bigint not null check (price_cents >= 0 and price_cents <= 100000000),
  cost_cents   bigint not null default 0 check (cost_cents >= 0 and cost_cents <= 100000000),
  stock        int not null default 0 check (stock >= 0),          -- nunca negativo
  min_stock    int not null default 0 check (min_stock >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, sku),
  unique (org_id, id),
  -- FKs compostas garantem que categoria/fornecedor pertencem à mesma organização.
  foreign key (org_id, category_id) references erp.categories (org_id, id) on delete set null (category_id),
  foreign key (org_id, supplier_id) references erp.suppliers (org_id, id) on delete set null (supplier_id)
);
create index on erp.products (org_id, name);

create table erp.sales (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references erp.organizations (id) on delete cascade,
  number          int not null,
  customer_name   text check (char_length(customer_name) <= 100),
  status          erp.sale_status not null default 'concluida',
  subtotal_cents  bigint not null check (subtotal_cents >= 0),
  discount_cents  bigint not null default 0 check (discount_cents >= 0),
  total_cents     bigint not null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  cancelled_at    timestamptz,
  cancelled_by    uuid references auth.users (id) on delete set null,
  cancel_reason   text check (char_length(cancel_reason) <= 300),
  unique (org_id, number),
  unique (org_id, id),
  check (discount_cents <= subtotal_cents),
  check (total_cents = subtotal_cents - discount_cents)
);
create index on erp.sales (org_id, created_at desc);

create table erp.sale_items (
  id                bigint generated always as identity primary key,
  sale_id           uuid not null,
  org_id            uuid not null,
  product_id        uuid not null,
  quantity          int not null check (quantity > 0),
  unit_price_cents  bigint not null check (unit_price_cents >= 0),  -- congelado na venda
  unit_cost_cents   bigint not null check (unit_cost_cents >= 0),   -- congelado na venda
  line_total_cents  bigint generated always as (quantity * unit_price_cents) stored,
  unique (sale_id, product_id),
  foreign key (org_id, sale_id) references erp.sales (org_id, id) on delete cascade,
  -- Verificada no commit: apagar a organização inteira funciona; apagar produto com histórico, não.
  foreign key (org_id, product_id) references erp.products (org_id, id) deferrable initially deferred
);
create index on erp.sale_items (org_id, product_id);

create table erp.stock_movements (
  id               bigint generated always as identity primary key,
  org_id           uuid not null references erp.organizations (id) on delete cascade,
  product_id       uuid not null,
  type             erp.movement_type not null,
  quantity         int not null check (quantity <> 0),   -- com sinal: + entra, − sai
  stock_after      int not null check (stock_after >= 0),
  unit_cost_cents  bigint check (unit_cost_cents >= 0),
  reason           text check (char_length(reason) <= 200),
  sale_id          uuid references erp.sales (id) on delete set null,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  -- Verificada no commit: apagar a organização inteira funciona; apagar produto com histórico, não.
  foreign key (org_id, product_id) references erp.products (org_id, id) deferrable initially deferred
);
create index on erp.stock_movements (org_id, created_at desc);
create index on erp.stock_movements (org_id, product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Auxiliares de permissão
-- ---------------------------------------------------------------------------

create or replace function erp.my_role(p_org uuid)
returns erp.member_role language sql stable security definer set search_path = '' as $$
  select role from erp.members where org_id = p_org and user_id = auth.uid()
$$;

create or replace function erp.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from erp.members where org_id = p_org and user_id = auth.uid())
$$;

create or replace function erp.has_role(p_org uuid, p_roles erp.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from erp.members
    where org_id = p_org and user_id = auth.uid() and role = any (p_roles)
  )
$$;

-- ---------------------------------------------------------------------------
-- Núcleo transacional (funções internas: recebem o ator explicitamente; não expostas)
-- ---------------------------------------------------------------------------

create or replace function erp._create_sale(
  p_org uuid, p_actor uuid, p_items jsonb, p_customer text, p_discount_cents bigint,
  p_created_at timestamptz default now())
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_items     record;
  v_subtotal  bigint := 0;
  v_number    int;
  v_sale      uuid;
  v_count     int;
  v_pids      uuid[];
  v_qtys      int[];
  v_missing   text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'VENDA_SEM_ITENS' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'VENDA_ITENS_DEMAIS' using errcode = '22023';
  end if;
  if coalesce(p_discount_cents, 0) < 0 then
    raise exception 'DESCONTO_INVALIDO' using errcode = '22023';
  end if;

  -- Itens normalizados em arrays paralelos; quantidades do mesmo produto são somadas.
  begin
    select array_agg(product_id order by product_id), array_agg(quantity order by product_id)
    into v_pids, v_qtys
    from (
      select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::int)::int as quantity
      from jsonb_array_elements(p_items) e
      group by 1
    ) req;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'QUANTIDADE_INVALIDA' using errcode = '22023';
  end;
  if exists (select 1 from unnest(v_pids, v_qtys) r(product_id, quantity)
             where product_id is null or quantity is null or quantity <= 0 or quantity > 10000) then
    raise exception 'QUANTIDADE_INVALIDA' using errcode = '22023';
  end if;

  -- 1) Bloqueia os produtos em ordem de id (ordem global evita deadlock entre vendas concorrentes).
  perform 1 from erp.products p
  where p.org_id = p_org and p.id = any (v_pids)
  order by p.id
  for update;

  select count(*) into v_count
  from erp.products p
  where p.org_id = p_org and p.active and p.id = any (v_pids);
  if v_count <> cardinality(v_pids) then
    raise exception 'PRODUTO_INVALIDO' using errcode = '22023';
  end if;

  -- 2) Valida o saldo de todos os itens antes de gravar qualquer coisa.
  select string_agg(format('%s (disponível: %s, pedido: %s)', p.name, p.stock, r.quantity), '; ' order by p.name)
  into v_missing
  from erp.products p join unnest(v_pids, v_qtys) r(product_id, quantity) on r.product_id = p.id
  where p.org_id = p_org and p.stock < r.quantity;
  if v_missing is not null then
    raise exception 'ESTOQUE_INSUFICIENTE' using errcode = 'P0001', detail = v_missing;
  end if;

  select sum(r.quantity::bigint * p.price_cents) into v_subtotal
  from erp.products p join unnest(v_pids, v_qtys) r(product_id, quantity) on r.product_id = p.id
  where p.org_id = p_org;
  if coalesce(p_discount_cents, 0) > v_subtotal then
    raise exception 'DESCONTO_INVALIDO' using errcode = '22023';
  end if;

  -- 3) Número sequencial por organização (linha da organização bloqueada pelo update).
  update erp.organizations set last_sale_number = last_sale_number + 1
  where id = p_org returning last_sale_number into v_number;

  insert into erp.sales (org_id, number, customer_name, subtotal_cents, discount_cents, total_cents, created_by, created_at)
  values (p_org, v_number, nullif(trim(p_customer), ''), v_subtotal, coalesce(p_discount_cents, 0),
          v_subtotal - coalesce(p_discount_cents, 0), p_actor, p_created_at)
  returning id into v_sale;

  insert into erp.sale_items (sale_id, org_id, product_id, quantity, unit_price_cents, unit_cost_cents)
  select v_sale, p_org, p.id, r.quantity, p.price_cents, p.cost_cents
  from erp.products p join unnest(v_pids, v_qtys) r(product_id, quantity) on r.product_id = p.id
  where p.org_id = p_org;

  for v_items in
    update erp.products p set stock = p.stock - r.quantity, updated_at = now()
    from unnest(v_pids, v_qtys) r(product_id, quantity)
    where p.id = r.product_id and p.org_id = p_org
    returning p.id, r.quantity, p.stock
  loop
    insert into erp.stock_movements (org_id, product_id, type, quantity, stock_after, sale_id, created_by, created_at, reason)
    values (p_org, v_items.id, 'venda', -v_items.quantity, v_items.stock, v_sale, p_actor, p_created_at,
            format('Venda nº %s', v_number));
  end loop;

  return v_sale;
end $$;

create or replace function erp._register_movement(
  p_org uuid, p_actor uuid, p_product uuid, p_type erp.movement_type, p_quantity int,
  p_reason text, p_unit_cost_cents bigint default null, p_created_at timestamptz default now())
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_product  erp.products;
  v_delta    int;
  v_id       bigint;
begin
  select * into v_product from erp.products where id = p_product and org_id = p_org for update;
  if not found then
    raise exception 'PRODUTO_INVALIDO' using errcode = '22023';
  end if;

  if p_type = 'entrada' then
    if p_quantity is null or p_quantity <= 0 then raise exception 'QUANTIDADE_INVALIDA' using errcode = '22023'; end if;
    if p_unit_cost_cents is not null and p_unit_cost_cents < 0 then raise exception 'CUSTO_INVALIDO' using errcode = '22023'; end if;
    v_delta := p_quantity;
  elsif p_type = 'saida' then
    if p_quantity is null or p_quantity <= 0 then raise exception 'QUANTIDADE_INVALIDA' using errcode = '22023'; end if;
    if nullif(trim(p_reason), '') is null then raise exception 'MOTIVO_OBRIGATORIO' using errcode = '22023'; end if;
    if v_product.stock < p_quantity then
      raise exception 'ESTOQUE_INSUFICIENTE' using errcode = 'P0001',
        detail = format('%s (disponível: %s, pedido: %s)', v_product.name, v_product.stock, p_quantity);
    end if;
    v_delta := -p_quantity;
  elsif p_type = 'ajuste' then
    -- p_quantity = contagem física
    if p_quantity is null or p_quantity < 0 then raise exception 'QUANTIDADE_INVALIDA' using errcode = '22023'; end if;
    if nullif(trim(p_reason), '') is null then raise exception 'MOTIVO_OBRIGATORIO' using errcode = '22023'; end if;
    v_delta := p_quantity - v_product.stock;
    if v_delta = 0 then raise exception 'AJUSTE_SEM_DIFERENCA' using errcode = '22023'; end if;
  else
    raise exception 'TIPO_INVALIDO' using errcode = '22023';
  end if;

  update erp.products
  set stock = stock + v_delta,
      cost_cents = case when p_type = 'entrada' and p_unit_cost_cents is not null then p_unit_cost_cents else cost_cents end,
      updated_at = now()
  where id = p_product;

  insert into erp.stock_movements (org_id, product_id, type, quantity, stock_after, unit_cost_cents, reason, created_by, created_at)
  values (p_org, p_product, p_type, v_delta, v_product.stock + v_delta,
          case when p_type = 'entrada' then p_unit_cost_cents end,
          left(nullif(trim(p_reason), ''), 200), p_actor, p_created_at)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- API pública (verifica papel do usuário autenticado)
-- ---------------------------------------------------------------------------

create or replace function erp.create_sale(p_org uuid, p_items jsonb, p_customer text default null, p_discount_cents bigint default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not erp.has_role(p_org, array['admin', 'vendedor']::erp.member_role[]) then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  return erp._create_sale(p_org, auth.uid(), p_items, p_customer, p_discount_cents);
end $$;

create or replace function erp.register_movement(
  p_org uuid, p_product uuid, p_type erp.movement_type, p_quantity int,
  p_reason text default null, p_unit_cost_cents bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if p_type not in ('entrada', 'saida', 'ajuste') then
    raise exception 'TIPO_INVALIDO' using errcode = '22023';
  end if;
  if not erp.has_role(p_org, array['admin', 'estoquista']::erp.member_role[]) then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  return erp._register_movement(p_org, auth.uid(), p_product, p_type, p_quantity, p_reason, p_unit_cost_cents);
end $$;

create or replace function erp.cancel_sale(p_sale uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sale  erp.sales;
  v_item  record;
begin
  select * into v_sale from erp.sales where id = p_sale for update;
  if v_sale.id is null or not erp.is_member(v_sale.org_id) then
    raise exception 'VENDA_INEXISTENTE' using errcode = 'P0002';
  end if;
  if not erp.has_role(v_sale.org_id, array['admin']::erp.member_role[]) then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if v_sale.status <> 'concluida' then
    raise exception 'VENDA_JA_CANCELADA' using errcode = 'P0001';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'MOTIVO_OBRIGATORIO' using errcode = '22023';
  end if;

  perform 1 from erp.products p
  where p.id in (select product_id from erp.sale_items where sale_id = p_sale)
  order by p.id for update;

  update erp.sales set status = 'cancelada', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = left(trim(p_reason), 300)
  where id = p_sale;

  for v_item in
    update erp.products p set stock = p.stock + i.quantity, updated_at = now()
    from erp.sale_items i
    where i.sale_id = p_sale and p.id = i.product_id
    returning p.id, i.quantity, p.stock
  loop
    insert into erp.stock_movements (org_id, product_id, type, quantity, stock_after, sale_id, created_by, reason)
    values (v_sale.org_id, v_item.id, 'estorno_venda', v_item.quantity, v_item.stock, p_sale, auth.uid(),
            format('Cancelamento da venda nº %s', v_sale.number));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Relatórios (security invoker: RLS decide o que o usuário enxerga)
-- ---------------------------------------------------------------------------

create or replace function erp.report_daily(p_org uuid, p_from date, p_to date)
returns table (day date, sales_count bigint, revenue_cents bigint, cost_cents bigint, margin_cents bigint)
language sql stable security invoker set search_path = '' as $$
  with tz as (select timezone from erp.organizations where id = p_org),
  s as (
    select (sa.created_at at time zone tz.timezone)::date as day, sa.id, sa.total_cents
    from erp.sales sa, tz
    where sa.org_id = p_org and sa.status = 'concluida'
      and (sa.created_at at time zone tz.timezone)::date between p_from and p_to
  ),
  c as (
    select s.day, sum(i.quantity::bigint * i.unit_cost_cents) as cost
    from s join erp.sale_items i on i.sale_id = s.id
    group by s.day
  )
  select s.day, count(*), sum(s.total_cents)::bigint, coalesce(max(c.cost), 0)::bigint,
         (sum(s.total_cents) - coalesce(max(c.cost), 0))::bigint
  from s left join c on c.day = s.day
  group by s.day
  order by s.day
$$;

create or replace function erp.report_products(p_org uuid, p_from date, p_to date)
returns table (product_id uuid, sku text, name text, quantity bigint, revenue_cents bigint, margin_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.sku, p.name, sum(i.quantity)::bigint,
         sum(i.line_total_cents)::bigint,
         sum(i.line_total_cents - i.quantity::bigint * i.unit_cost_cents)::bigint
  from erp.sales sa
  join erp.organizations o on o.id = sa.org_id
  join erp.sale_items i on i.sale_id = sa.id
  join erp.products p on p.id = i.product_id
  where sa.org_id = p_org and sa.status = 'concluida'
    and (sa.created_at at time zone o.timezone)::date between p_from and p_to
  group by p.id, p.sku, p.name
  order by 5 desc
$$;

-- Observação: a receita por produto é bruta (antes do desconto da venda); o relatório diário usa o
-- total líquido. O README explica a diferença.

create view erp.low_stock with (security_invoker = true) as
  select id, org_id, sku, name, stock, min_stock
  from erp.products
  where active and stock <= min_stock;

-- ---------------------------------------------------------------------------
-- Catálogo de exemplo (dados fictícios) e cadastro
-- ---------------------------------------------------------------------------

create or replace function erp.seed_sample_catalog(p_org uuid, p_actor uuid, p_with_sales boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c_beb uuid; c_mer uuid; c_lim uuid; c_hig uuid;
  s_alfa uuid; s_beta uuid;
  v_prod record;
  v_ids uuid[];
  v_day int;
  v_n int := 0;
begin
  insert into erp.categories (org_id, name) values (p_org, 'Bebidas') returning id into c_beb;
  insert into erp.categories (org_id, name) values (p_org, 'Mercearia') returning id into c_mer;
  insert into erp.categories (org_id, name) values (p_org, 'Limpeza') returning id into c_lim;
  insert into erp.categories (org_id, name) values (p_org, 'Higiene') returning id into c_hig;
  insert into erp.suppliers (org_id, name, document, email)
    values (p_org, 'Distribuidora Alfa (fictícia)', '00.000.000/0001-00', 'contato@alfa.exemplo') returning id into s_alfa;
  insert into erp.suppliers (org_id, name, document, email)
    values (p_org, 'Atacado Beta (fictício)', '11.111.111/0001-11', 'vendas@beta.exemplo') returning id into s_beta;

  insert into erp.products (org_id, sku, name, category_id, supplier_id, price_cents, cost_cents, min_stock) values
    (p_org, 'BEB-001', 'Água mineral 500 ml', c_beb, s_alfa, 300, 120, 24),
    (p_org, 'BEB-002', 'Refrigerante lata 350 ml', c_beb, s_alfa, 550, 280, 24),
    (p_org, 'BEB-003', 'Suco de uva 1 L', c_beb, s_alfa, 1290, 690, 6),
    (p_org, 'MER-001', 'Arroz tipo 1 5 kg', c_mer, s_beta, 2790, 1990, 10),
    (p_org, 'MER-002', 'Feijão carioca 1 kg', c_mer, s_beta, 899, 590, 10),
    (p_org, 'MER-003', 'Café torrado 500 g', c_mer, s_beta, 1999, 1290, 8),
    (p_org, 'MER-004', 'Açúcar refinado 1 kg', c_mer, s_beta, 549, 349, 10),
    (p_org, 'LIM-001', 'Detergente 500 ml', c_lim, s_beta, 279, 149, 12),
    (p_org, 'LIM-002', 'Sabão em pó 1 kg', c_lim, s_beta, 1490, 920, 6),
    (p_org, 'HIG-001', 'Sabonete 90 g', c_hig, s_alfa, 249, 119, 20),
    (p_org, 'HIG-002', 'Creme dental 90 g', c_hig, s_alfa, 459, 239, 12),
    (p_org, 'HIG-003', 'Papel higiênico 12 rolos', c_hig, s_alfa, 2290, 1490, 5);

  -- Estoque inicial por entrada (o saldo nunca é escrito diretamente).
  for v_prod in select id, cost_cents, min_stock from erp.products where org_id = p_org order by sku loop
    perform erp._register_movement(p_org, p_actor, v_prod.id, 'entrada', v_prod.min_stock * 3,
                                   'Estoque inicial', v_prod.cost_cents, now() - interval '31 days');
  end loop;

  if not p_with_sales then return; end if;

  -- Vendas dos últimos 30 dias, determinísticas.
  select array_agg(id order by sku) into v_ids from erp.products where org_id = p_org;
  for v_day in reverse 30 .. 1 loop
    for k in 1 .. 1 + (v_day % 3) loop
      v_n := v_n + 1;
      begin
        perform erp._create_sale(
          p_org, p_actor,
          jsonb_build_array(
            jsonb_build_object('product_id', v_ids[1 + (v_n % 12)], 'quantity', 1 + (v_n % 3)),
            jsonb_build_object('product_id', v_ids[1 + ((v_n * 5) % 12)], 'quantity', 1)
          ),
          case when v_n % 4 = 0 then 'Cliente balcão' end,
          case when v_n % 10 = 0 then 100 else 0 end,
          now() - make_interval(days => v_day) + make_interval(hours => 9 + (v_n % 9))
        );
      exception when others then
        null; -- item sem saldo: venda simplesmente não acontece (como na vida real)
      end;
    end loop;
  end loop;
  -- Deixa dois produtos abaixo do mínimo para demonstrar os alertas.
  perform erp._register_movement(p_org, p_actor, v_ids[3], 'ajuste', 2, 'Contagem de inventário');
  perform erp._register_movement(p_org, p_actor, v_ids[12], 'ajuste', 1, 'Contagem de inventário');
end $$;

-- Cadastro pelo app: cria uma organização sandbox própria (admin) com catálogo de exemplo.
create or replace function erp.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org  uuid;
  v_name text;
begin
  if new.raw_user_meta_data ->> 'app' is distinct from 'erp' then
    return new;
  end if;
  v_name := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100);
  if char_length(v_name) < 2 then v_name := 'Usuário'; end if;
  insert into erp.organizations (name, is_sandbox)
    values (left('Empresa de ' || v_name, 80), true) returning id into v_org;
  insert into erp.members (org_id, user_id, role, full_name) values (v_org, new.id, 'admin', v_name);
  perform erp.seed_sample_catalog(v_org, new.id, true);
  return new;
end $$;

create trigger erp_on_auth_user_created
  after insert on auth.users
  for each row execute function erp.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

grant usage on schema erp to authenticated, service_role;
revoke all on all functions in schema erp from public;
revoke all on all tables in schema erp from anon, authenticated;

grant select on all tables in schema erp to authenticated;
grant update (name) on erp.organizations to authenticated;
grant insert, update, delete on erp.categories, erp.suppliers to authenticated;
-- O saldo (stock) fica fora: só muda via funções de movimentação/venda.
grant insert (org_id, sku, name, category_id, supplier_id, price_cents, cost_cents, min_stock, active)
  on erp.products to authenticated;
grant update (sku, name, category_id, supplier_id, price_cents, cost_cents, min_stock, active, updated_at)
  on erp.products to authenticated;
grant all on all tables in schema erp to service_role;

grant execute on function erp.my_role(uuid), erp.is_member(uuid), erp.has_role(uuid, erp.member_role[]) to authenticated;
grant execute on function erp.create_sale(uuid, jsonb, text, bigint) to authenticated;
grant execute on function erp.register_movement(uuid, uuid, erp.movement_type, int, text, bigint) to authenticated;
grant execute on function erp.cancel_sale(uuid, text) to authenticated;
grant execute on function erp.report_daily(uuid, date, date), erp.report_products(uuid, date, date) to authenticated;
grant execute on function erp.seed_sample_catalog(uuid, uuid, boolean) to service_role;

alter table erp.organizations   enable row level security;
alter table erp.members         enable row level security;
alter table erp.categories      enable row level security;
alter table erp.suppliers       enable row level security;
alter table erp.products        enable row level security;
alter table erp.sales           enable row level security;
alter table erp.sale_items      enable row level security;
alter table erp.stock_movements enable row level security;

create policy "org: membros leem" on erp.organizations for select to authenticated using (erp.is_member(id));
create policy "org: admin renomeia" on erp.organizations for update to authenticated
  using (erp.has_role(id, array['admin']::erp.member_role[]))
  with check (erp.has_role(id, array['admin']::erp.member_role[]));

create policy "membros: leem a própria org" on erp.members for select to authenticated using (erp.is_member(org_id));

-- Leitura: qualquer membro da organização.
create policy "leitura" on erp.categories      for select to authenticated using (erp.is_member(org_id));
create policy "leitura" on erp.suppliers       for select to authenticated using (erp.is_member(org_id));
create policy "leitura" on erp.products        for select to authenticated using (erp.is_member(org_id));
create policy "leitura" on erp.sales           for select to authenticated using (erp.is_member(org_id));
create policy "leitura" on erp.sale_items      for select to authenticated using (erp.is_member(org_id));
create policy "leitura" on erp.stock_movements for select to authenticated using (erp.is_member(org_id));

-- Catálogo: admin e estoquista.
create policy "catálogo: escrita" on erp.categories for all to authenticated
  using (erp.has_role(org_id, array['admin', 'estoquista']::erp.member_role[]))
  with check (erp.has_role(org_id, array['admin', 'estoquista']::erp.member_role[]));
create policy "catálogo: escrita" on erp.suppliers for all to authenticated
  using (erp.has_role(org_id, array['admin', 'estoquista']::erp.member_role[]))
  with check (erp.has_role(org_id, array['admin', 'estoquista']::erp.member_role[]));
create policy "catálogo: inserir" on erp.products for insert to authenticated
  with check (erp.has_role(org_id, array['admin', 'estoquista']::erp.member_role[]));
create policy "catálogo: alterar" on erp.products for update to authenticated
  using (erp.has_role(org_id, array['admin', 'estoquista']::erp.member_role[]))
  with check (erp.has_role(org_id, array['admin', 'estoquista']::erp.member_role[]));
-- Sem política de delete em produtos (desativar preserva o histórico); vendas e movimentações
-- não têm políticas de escrita: só as funções acima as gravam.
