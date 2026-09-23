-- Phase 1 — Price Books (Bảng giá mới)
-- Thay thế logic VIP cứng, hỗ trợ bảng giá chung và bảng giá khách hàng cụ thể.

-- 1. Bảng giá chính
create table if not exists public.price_books (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('general', 'customer', 'group', 'department')),
  source_price_book_id uuid references public.price_books(id) on delete set null,
  valid_from timestamptz,
  valid_to timestamptz,
  status text not null check (status in ('draft', 'pending_approval', 'active', 'expired', 'archived')) default 'draft',
  allow_unlisted_products boolean not null default true,
  auto_sync_from_source boolean not null default false,
  rounding_rule text not null default 'nearest_100',
  version integer not null default 1,
  kiotviet_ref text,
  created_by text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Chi tiết bảng giá (Items)
create table if not exists public.price_book_items (
  price_book_id uuid not null references public.price_books(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sku_snapshot text,
  name_snapshot text,
  unit_snapshot text,
  base_price numeric(14,2),
  price numeric(14,2) not null,
  discount_percent numeric(5,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  min_qty numeric(12,3),
  order_step numeric(12,3),
  effective_from timestamptz,
  effective_to timestamptz,
  source_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (price_book_id, product_id)
);

-- 3. Phân công bảng giá cho Khách hàng
create table if not exists public.price_book_customer_assignments (
  id uuid primary key default gen_random_uuid(),
  price_book_id uuid not null references public.price_books(id) on delete cascade,
  customer_id uuid not null references public.vip_accounts(id) on delete cascade,
  valid_from timestamptz,
  valid_to timestamptz,
  priority integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text
);
create index idx_pb_cust_assign on public.price_book_customer_assignments (customer_id, valid_from, valid_to);

-- 4. Phân công vận hành khách hàng (Vận hành, Sale, Chi nhánh)
create table if not exists public.customer_operations_assignments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.vip_accounts(id) on delete cascade,
  operation_dept text, -- Ví dụ: 'Vận hành HN', 'Vận hành ĐN'
  sales_rep_id text,
  branch_id text,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now()
);
create index idx_cust_op_assign on public.customer_operations_assignments (customer_id);

-- 5. Lịch sử thay đổi / Import
create table if not exists public.price_book_import_jobs (
  id uuid primary key default gen_random_uuid(),
  price_book_id uuid references public.price_books(id) on delete cascade,
  status text not null check (status in ('processing', 'completed', 'failed', 'preview')),
  created_by text,
  stats jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.price_book_import_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.price_book_import_jobs(id) on delete cascade,
  row_index integer not null,
  raw_data jsonb not null,
  matched_product_id uuid references public.products(id) on delete set null,
  validation_status text check (validation_status in ('valid', 'invalid', 'ambiguous', 'blank-vs-zero')),
  validation_errors jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.price_book_audit_logs (
  id uuid primary key default gen_random_uuid(),
  price_book_id uuid not null references public.price_books(id) on delete cascade,
  action text not null,
  performed_by text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.price_books enable row level security;
alter table public.price_book_items enable row level security;
alter table public.price_book_customer_assignments enable row level security;
alter table public.customer_operations_assignments enable row level security;
alter table public.price_book_import_jobs enable row level security;
alter table public.price_book_import_rows enable row level security;
alter table public.price_book_audit_logs enable row level security;

-- Chỉ công khai bảng giá CHUNG đang active. Bảng giá riêng, assignment,
-- import và audit chỉ được truy cập qua Server API dùng service_role.
drop policy if exists "allow_read_active_pricebooks" on public.price_books;
create policy "allow_read_active_pricebooks" on public.price_books
for select using (status = 'active' and kind = 'general');

drop policy if exists "allow_read_pb_items" on public.price_book_items;
create policy "allow_read_pb_items" on public.price_book_items
for select using (
  exists (
    select 1 from public.price_books pb
    where pb.id = price_book_items.price_book_id
      and pb.status = 'active'
      and pb.kind = 'general'
  )
);

drop policy if exists "allow_read_pb_cust_assign" on public.price_book_customer_assignments;

revoke all on public.price_book_customer_assignments from anon, authenticated;
revoke all on public.customer_operations_assignments from anon, authenticated;
revoke all on public.price_book_import_jobs from anon, authenticated;
revoke all on public.price_book_import_rows from anon, authenticated;
revoke all on public.price_book_audit_logs from anon, authenticated;

