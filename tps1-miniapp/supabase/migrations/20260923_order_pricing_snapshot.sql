-- Phase 1 — Order Pricing Snapshot & Audit
-- Đảm bảo giá trong đơn hàng là snapshot, không tự thay đổi khi đổi bảng giá.

-- 1. Snapshot bảng giá vào đơn hàng
alter table public.orders
  add column if not exists price_book_id uuid references public.price_books(id) on delete set null,
  add column if not exists price_book_version integer,
  add column if not exists price_resolution_status text not null default 'pending'
    check (price_resolution_status in ('pending', 'resolved', 'manual', 'error')),
  add column if not exists price_locked_at timestamptz,
  add column if not exists customer_price_source text,
  add column if not exists delivery_shift text,
  add column if not exists branch_id text;

-- Cập nhật bảng order_items để lưu vết các thành phần tạo nên giá
alter table public.order_items
  add column if not exists general_unit_price numeric(14,2),
  add column if not exists assigned_unit_price numeric(14,2),
  add column if not exists discount_percent numeric(5,2) default 0,
  add column if not exists discount_amount numeric(14,2) default 0,
  add column if not exists final_unit_price numeric(14,2),
  add column if not exists manual_price numeric(14,2),
  add column if not exists manual_price_reason text,
  add column if not exists price_source text,
  add column if not exists unit_snapshot text,
  add column if not exists packaging_note text,
  add column if not exists min_qty_snapshot numeric(12,3),
  add column if not exists order_step_snapshot numeric(12,3);

-- Nếu version SQL cũ chưa có product_name_snapshot, tạo lại:
alter table public.order_items
  add column if not exists product_name_snapshot text;

-- 2. Audit Gộp đơn (Merge Order)
create table if not exists public.order_merge_audit (
  id uuid primary key default gen_random_uuid(),
  parent_order_id uuid not null references public.orders(id) on delete cascade,
  old_order_id uuid not null references public.orders(id) on delete cascade,
  merge_condition jsonb,
  merged_by text,
  merged_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists merged_into_order_id uuid references public.orders(id) on delete set null;

-- Mở rộng trạng thái hiện hữu để hỗ trợ gộp đơn. Không tạo constraint thứ hai.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('draft', 'pending', 'confirmed', 'preparing', 'shipping', 'completed', 'canceled', 'merged'));

-- 3. Bổ sung các cột trước/sau cho order_change_requests
alter table public.order_change_requests
  add column if not exists before_state jsonb,
  add column if not exists after_state jsonb,
  add column if not exists customer_notified boolean default false;

-- 4. Bảng tài liệu đơn hàng (Ví dụ: file PDF chốt giá)
create table if not exists public.order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  doc_type text not null,
  version integer not null default 1,
  file_path text not null,
  file_hash text,
  generated_by text,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.order_merge_audit enable row level security;
alter table public.order_documents enable row level security;

