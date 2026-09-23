# Quá Trình Hoàn Thiện Tính Năng POS Tạo Đơn Hàng Admin

Hệ thống đã được nâng cấp toàn diện chức năng "Tạo Đơn Hàng Mới", chuyển đổi từ một popup modal chật chội sang giao diện POS 2 cột cực kỳ rộng rãi và chuyên nghiệp!

## 1. Những Nâng Cấp Nổi Bật Trên Giao Diện (Admin UI)
- **Thiết Kế 2 Cột Chuyên Nghiệp:** Giống hệt máy POS, bên trái là kho hàng & giỏ hàng, bên phải là thông tin thanh toán & khách hàng.
- **Thêm Sản Phẩm Ngoài (Custom):** Sale giờ đây có thể gõ tên và giá của bất kỳ món hàng nào nằm ngoài hệ thống. Logo TPS1 sẽ tự động được sử dụng làm hình mặc định!
- **Sửa Đơn Giá Trực Tiếp:** Tại bảng giỏ hàng, Sale có thể bấm vào cột Đơn giá để thay đổi mức giá theo ý muốn cho từng món hàng cụ thể (kể cả hàng trong Database).
- **Chế Độ Chiết Khấu Toàn Diện:** Bổ sung các ô nhập:
  - Mã Voucher / Số tiền giảm của Voucher.
  - Chiết khấu thêm riêng (Tiền mặt).
  - Phí giao hàng (Shipping).
- **Trải Nghiệm Mượt Mà:** Tổng tiền được tự động tính toán ngay lập tức khi thay đổi bất kỳ ô số lượng, giá, hoặc chiết khấu nào.

## 2. Nâng Cấp Kỹ Thuật (Backend)
- Đã bổ sung Script RPC `admin_create_order_full` (Siêu hàm tạo đơn). Khác với hàm tạo đơn của khách (ép giá gốc), hàm này **tuyệt đối tin tưởng giá trị Sale truyền lên** để lưu trữ chính xác các mức giá đã tinh chỉnh.
- Cập nhật API Next.js Route `/api/admin/orders/create` để trung chuyển toàn bộ dữ liệu Vouchers & Chiết khấu xuống hàm RPC mới.

---

## 3. Các Bước Cần Thực Hiện Của Anh
> [!IMPORTANT]  
> Để hệ thống hoạt động hoàn chỉnh, anh cần cập nhật **Database Supabase** để khai báo hàm RPC mới (`admin_create_order_full`).

1. Anh truy cập vào [Supabase Dashboard](https://supabase.com/dashboard/project/_/sql).
2. Copy và Chạy nội dung trong file [tps1-miniapp/supabase/migrations/20260824_admin_pos_create_order.sql](file:///d:/thuc_pham_so_mot/thuc_pham_so_mot/tps1-miniapp/supabase/migrations/20260824_admin_pos_create_order.sql) vào công cụ SQL Editor.
3. Nhấn **RUN** để khởi tạo hàm.
4. Mở `quanly/index.html` hoặc tải lại trang Vercel để trải nghiệm thành quả ngay lập tức!

## 4. G1.2 — Bảng giá và bảo mật (bổ sung)

- Bảng giá chung active có thể được đọc qua policy giới hạn; bảng giá riêng, assignment, import, audit và dữ liệu phân công không được client truy cập trực tiếp.
- API resolve giá dùng `POST` với `orderSessionToken`, lấy `customer_id` từ `customer_sessions`, kiểm tra session còn hạn và kiểm tra hiệu lực bảng giá/assignment/item.
- Giá riêng thiếu dòng sẽ fallback sang bảng giá chung và trả về `price_source=general_fallback`.
- Fixture staging có bảng giá chung, bảng giá riêng, bảng giá hết hạn, fallback và đơn `merged`; fixture có thể chạy lại.
- Rollback không xoá các cột legacy như `pricing_status`, `final_unit_price`, `department_id`; chỉ rollback các cột G1 mới và dừng nếu còn đơn `merged`.
- Migration snapshot dùng `price_resolution_status` riêng để không xung đột với `orders.pricing_status` cũ (`provisional/finalized`).

### Kiểm tra trước G2

1. Chạy các migration G1 trên database staging.
2. Chạy `test_pricebook_fixtures.sql` bằng SQL Editor staging.
3. Gọi `scratch/test_resolve.js` với session token staging.
4. Kiểm tra fallback, bảng giá hết hạn, RLS và rollback trong một database staging riêng.
