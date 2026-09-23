-- Phase 1 — Product Order Constraints
-- Ràng buộc về số lượng đặt hàng tối thiểu, bước nhảy số lượng, và quy cách đóng gói.

alter table public.products
  add column if not exists min_order_qty numeric(12,3) default 1,
  add column if not exists order_step numeric(12,3) default 1,
  add column if not exists enforce_order_step boolean default false,
  add column if not exists packaging_note text,
  add column if not exists quantity_precision integer default 0;

-- quantity_precision: 0 (số nguyên), 1 (1 chữ số thập phân), 3 (3 chữ số thập phân)
