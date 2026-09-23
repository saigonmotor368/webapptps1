-- Phase 1 — Rollback G1
-- Xoá toàn bộ cấu trúc bảng giá mới và khôi phục cột (nếu cần thiết)

-- 1. Xoá các policy
drop policy if exists "allow_read_active_pricebooks" on public.price_books;
drop policy if exists "allow_read_pb_items" on public.price_book_items;
drop policy if exists "allow_read_pb_cust_assign" on public.price_book_customer_assignments;
drop policy if exists "allow_service_role_merge" on public.order_merge_audit;
drop policy if exists "allow_service_role_docs" on public.order_documents;

-- 2. Xoá bảng từ ngoài vào trong
drop table if exists public.order_documents cascade;
drop table if exists public.order_merge_audit cascade;
drop table if exists public.price_book_audit_logs cascade;
drop table if exists public.price_book_import_rows cascade;
drop table if exists public.price_book_import_jobs cascade;
drop table if exists public.customer_operations_assignments cascade;
drop table if exists public.price_book_customer_assignments cascade;
drop table if exists public.price_book_items cascade;
drop table if exists public.price_books cascade;

-- 3. Xoá cột đã thêm vào order_items
alter table public.order_items
  drop column if exists general_unit_price,
  drop column if exists assigned_unit_price,
  drop column if exists discount_amount,
  drop column if exists manual_price,
  drop column if exists manual_price_reason,
  drop column if exists price_source,
  drop column if exists unit_snapshot,
  drop column if exists packaging_note,
  drop column if exists min_qty_snapshot,
  drop column if exists order_step_snapshot,
  drop column if exists product_name_snapshot;

-- 4. Xoá cột đã thêm vào orders
alter table public.orders
  drop column if exists price_book_id,
  drop column if exists price_book_version,
  drop column if exists price_resolution_status,
  drop column if exists price_locked_at,
  drop column if exists customer_price_source,
  drop column if exists delivery_shift,
  drop column if exists branch_id,
  drop column if exists merged_into_order_id;

-- Khôi phục constraint status trước G1.2. Chỉ chạy khi không còn đơn status='merged'.
do $$
begin
  if exists (select 1 from public.orders where status = 'merged') then
    raise exception 'Không thể rollback: vẫn còn đơn ở trạng thái merged';
  end if;
end $$;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'confirmed', 'preparing', 'shipping', 'completed', 'canceled'));

-- 5. Xoá cột đã thêm vào products
alter table public.products
  drop column if exists min_order_qty,
  drop column if exists order_step,
  drop column if exists enforce_order_step,
  drop column if exists packaging_note,
  drop column if exists quantity_precision;

-- 6. Xoá cột đã thêm vào order_change_requests
alter table public.order_change_requests
  drop column if exists before_state,
  drop column if exists after_state,
  drop column if exists customer_notified;
