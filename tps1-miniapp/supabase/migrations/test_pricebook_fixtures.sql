-- Test Fixtures cho Bảng giá mới (G1.1)
-- Dữ liệu giả định để kiểm thử fallback giá, bảng giá riêng, bảng giá chung, bảng giá hết hạn và trạng thái merged

do $$
declare
  v_general_pb_id uuid := gen_random_uuid();
  v_customer_pb_id uuid := gen_random_uuid();
  v_expired_pb_id uuid := gen_random_uuid();
  v_customer_id uuid;
  v_product_1 uuid;
  v_product_2 uuid;
  v_order_id uuid;
  v_merged_order_id uuid;
begin
  -- Cho phép chạy lại fixture trên staging mà không lỗi trùng mã bảng giá.
  delete from public.price_books
  where code in ('PB_GEN_2026', 'PB_CUST_TEST', 'PB_DRAFT', 'PB_EXPIRED');

  -- Lấy 1 khách hàng test (giả định có KH active)
  select id into v_customer_id from public.vip_accounts where is_active = true limit 1;
  
  -- Lấy 2 sản phẩm test
  select id into v_product_1 from public.products where active = true limit 1;
  select id into v_product_2 from public.products where id != v_product_1 and active = true limit 1;

  if v_customer_id is null or v_product_1 is null then
    raise notice 'Không đủ dữ liệu khách hàng hoặc sản phẩm để tạo fixture';
    return;
  end if;

  -- 1. Tạo Bảng giá chung
  insert into public.price_books (id, code, name, kind, status, valid_from)
  values (v_general_pb_id, 'PB_GEN_2026', 'Bảng giá chung 2026', 'general', 'active', now());

  -- Giá chung cho SP1 và SP2
  insert into public.price_book_items (price_book_id, product_id, price)
  values 
    (v_general_pb_id, v_product_1, 100000),
    (v_general_pb_id, v_product_2, 150000);

  -- 2. Tạo Bảng giá riêng cho khách hàng
  insert into public.price_books (id, code, name, kind, status, valid_from)
  values (v_customer_pb_id, 'PB_CUST_TEST', 'Bảng giá riêng Khách Test', 'customer', 'active', now());

  -- Gán bảng giá cho khách
  insert into public.price_book_customer_assignments (price_book_id, customer_id, valid_from)
  values (v_customer_pb_id, v_customer_id, now());

  -- Giá riêng chỉ có SP1 (Rẻ hơn giá chung)
  -- Thiếu SP2 (để test fallback lấy giá chung 150000)
  insert into public.price_book_items (price_book_id, product_id, price)
  values 
    (v_customer_pb_id, v_product_1, 95000);
    
  -- 3. Tạo một bảng giá nháp (Draft) để test không được lấy giá
  insert into public.price_books (code, name, kind, status)
  values ('PB_DRAFT', 'Bảng giá Nháp (Chưa duyệt)', 'customer', 'draft');

  -- 4. Tạo bảng giá ĐÃ HẾT HẠN (Expired)
  insert into public.price_books (id, code, name, kind, status, valid_from, valid_to)
  values (v_expired_pb_id, 'PB_EXPIRED', 'Bảng giá đã hết hạn', 'customer', 'expired', now() - interval '30 days', now() - interval '1 day');
  
  -- Gán bảng giá hết hạn cho khách (để test resolve giá sẽ bỏ qua và rớt xuống bảng chung)
  insert into public.price_book_customer_assignments (price_book_id, customer_id, valid_from, valid_to)
  values (v_expired_pb_id, v_customer_id, now() - interval '30 days', now() - interval '1 day');

  -- 5. Tạo dữ liệu giả định cho trạng thái đơn MERGED
  select id into v_order_id from public.orders where customer_id = v_customer_id limit 1;
  
  if v_order_id is not null then
    -- Đơn cũ bị gộp
    insert into public.orders (
      order_code, customer_id, customer_code, customer_name, customer_phone,
      source, idempotency_key,
      status, subtotal, grand_total, merged_into_order_id
    )
    select 
      order_code || '-M-' || substr(gen_random_uuid()::text, 1, 8),
      customer_id, customer_code, customer_name, customer_phone,
      source, idempotency_key || '-merged-' || substr(gen_random_uuid()::text, 1, 8),
      'merged', 100000, 100000, v_order_id
    from public.orders
    where id = v_order_id
    returning id into v_merged_order_id;
    
    -- Ghi audit gộp đơn
    insert into public.order_merge_audit (parent_order_id, old_order_id, merge_condition, merged_by)
    values (v_order_id, v_merged_order_id, '{"reason": "Cùng ngày giao"}', 'admin_test');
  end if;

  raise notice 'Đã tạo xong dữ liệu mẫu cho bảng giá và đơn gộp';
end $$;
