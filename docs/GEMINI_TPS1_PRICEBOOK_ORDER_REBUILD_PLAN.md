# TPS1 — Kế hoạch chuẩn hoá bảng giá và luồng đơn hàng (giao Gemini)

> Phạm vi: xây lại nền tảng thay KiotViet cho đặt hàng và xử lý đơn. Đây là tài liệu giao việc; Gemini phải đọc toàn bộ trước khi sửa mã. Không được xoá dữ liệu production hoặc thay đổi luồng cũ trực tiếp.

## 1. Kết luận nghiệp vụ bắt buộc

1. **Giá không còn được tính theo VIP là nguồn chính.** Mỗi khách hàng được gán một bảng giá riêng; bảng giá chung là fallback. Các cột VIP cũ chỉ giữ để tương thích/migration.
2. Một bảng giá có: tên, mã, hiệu lực từ–đến, trạng thái nháp/đang áp dụng/hết hạn, công thức hoặc nguồn bảng giá, quy tắc làm tròn, cho phép/không cho phép mặt hàng ngoài bảng giá.
3. Phạm vi áp dụng phải hỗ trợ đúng mô hình KiotViet: chi nhánh, nhóm khách hàng/khách cụ thể, người tạo giao dịch; về sau bổ sung phòng ban. TPS1 có thể chạy một chi nhánh trước nhưng không hard-code.
4. Vận hành được xem giá chung và giá riêng của khách; khách chỉ thấy **giá hiệu lực cuối cùng** của chính mình.
5. Giá trong đơn phải là **snapshot**: giá chung, giá riêng, chiết khấu, giá cuối, bảng giá và phiên bản bảng giá. Sau khi xác nhận không được tự thay đổi theo giá mới.
6. Đơn hàng có hai lớp: tiếp nhận đơn khách và xử lý/soạn hàng. Đơn chỉ được xác nhận khi mọi dòng có giá hợp lệ hoặc đã có override thủ công kèm lý do.
7. Mọi đổi hàng, thiếu hàng, đổi quy cách, đổi giá sau khi xác nhận phải có change request, lý do, người tạo, người duyệt và thông báo cho khách.
8. Gộp đơn chỉ áp dụng cho cùng mã khách, cùng ngày giao/địa chỉ, cùng điều kiện xử lý và chưa khoá chứng từ. Không xoá vật lý đơn cũ; chuyển sang `merged` và lưu `merged_into_order_id` để truy vết.
9. **Mốc chốt đơn Phase 1 là 17:00.** Hệ thống phải hiển thị cảnh báo và chặn đơn giao ngày hôm sau sau 17:00, chỉ cho ngoại lệ khi người có quyền ghi lý do.
10. **Vận hành là đầu mối theo sát đơn ở Phase 1.** Vận hành tiếp nhận, kiểm tra, trao đổi với khách, phối hợp Thu mua lấy giá/tình trạng hàng, hoàn thiện đơn và chăm sóc khách. Thu mua vẫn có quyền chuyên môn về hàng, giá chung, nguồn cung và điều chỉnh; nhưng không làm đứt luồng chăm sóc khách của Vận hành.
11. **Phê duyệt bảng giá:** Trưởng phòng Thu mua cấp bảng giá chung; Kế toán tính bảng giá riêng theo công thức và upload; CEO duyệt và kích hoạt bảng giá. Upload chưa được duyệt không được áp dụng.
12. Nếu bảng giá riêng thiếu sản phẩm, mặc định dùng bảng giá chung nếu dòng đó có giá hợp lệ; hệ thống phải lưu `price_source=general_fallback` để truy vết.

## 2. Nguồn dữ liệu đã đối chiếu

### 2.1. File giá

- `BangGia_KV22092026-213634-533.xlsx`: 5.315 dòng, 8 cột KiotViet; chỉ khoảng 2.040 dòng có giá chung khác 0. Blank/0 không được tự động coi là cùng một nghĩa.
- `BangGia_KV22092026-164602-820.xlsx`: cùng cấu trúc, là snapshot trước đó.
- `MauFileBangGia.xlsx`: template tối giản gồm `Mã hàng`, `Tên hàng`, `Tên bảng giá 1/2/3`; dùng làm format import chuẩn v1.
- `BẢNG TÍNH GIÁ CÁC BẾP TP 09.26.xlsx`: nhiều sheet, header nhiều tầng, nhiều cột bếp/khách và cột `GIÁ/C.KHẤU`, `BBG CHUNG`, `BBG HPF`, `BBG LONG SƠN`…; phải có màn hình chọn sheet, nhận diện header và preview mapping, không được import mù.
- `BangGiaSanPham_KV22092026-201403-895.xlsx`: danh mục hàng và đơn vị; sản phẩm có thể có giá 0 nên phải phân biệt “giá 0 có chủ ý” với “không có giá”.

### 2.2. File đơn và nghiệp vụ

- `DanhSachDatHang_KV22092026-185933-556.xlsx`: 132 dòng (131 đơn), trạng thái `Phiếu tạm`, tổng khách cần trả 690.851.125đ. Đây là lớp đơn tạm/tiếp nhận, không trộn với đơn đã giao.
- `danh-sach-don-hang_2026-09-22.xlsx`: báo cáo đơn giao/xử lý với mã khách, sale, tổng tiền, đã trả, còn nợ, trạng thái xử lý và thanh toán.
- `ChiTietDatHang ... DH080259 ...xlsx`: chứng minh mỗi dòng cần lưu số lượng, đơn giá gốc, giảm giá %, giảm giá tiền, giá bán cuối, thành tiền.
- `SoQuy_...xlsx`: dữ liệu thu/chi; chỉ dùng làm nguồn đối chiếu công nợ/thanh toán, không dùng làm bảng giá.
- `DanhSachNhaCungCap_...xlsx`: 189 nhà cung cấp; chuẩn bị khoá liên kết nhà cung cấp–sản phẩm cho phase mua hàng, chưa đưa vào logic giá khách.

### 2.3. Quy trình phòng ban

- **Vận hành:** đầu mối toàn bộ đơn Phase 1; nhận đơn trước 17:00, kiểm tra và xử lý đơn, liên hệ khách, yêu cầu Thu mua bổ sung/điều chỉnh hàng và giá, gửi xác nhận, theo dõi giao hàng.
- **Thu mua:** cấp bảng giá chung, kiểm tra nguồn cung/tồn khả dụng, xác nhận giá hàng tươi và xử lý thiếu/đổi/trả; có quyền chỉnh chuyên môn nhưng mọi thay đổi đơn đi qua Vận hành.
- **Kế toán:** quản lý mã hàng, giá vốn/giá thành, tính bảng giá riêng theo công thức, upload bản nháp lên hệ thống, theo dõi công nợ, thu–chi và hoá đơn.
- **CEO:** duyệt và kích hoạt bảng giá mới; duyệt các ngoại lệ/giá đặc biệt theo chính sách công ty.
- Không gán quyền theo tên cá nhân trong code. Tài khoản mới phải chọn phòng ban, chức danh và phạm vi chi nhánh; trưởng phòng có quyền duyệt các điều chỉnh thuộc phòng mình theo ma trận quyền.

## 3. Kiến trúc dữ liệu đề xuất

### 3.1. Bảng giá

Tạo migration `20260923_price_books.sql` (backward-compatible):

- `price_books`: `id`, `code`, `name`, `kind` (`general|customer|group|department`), `source_price_book_id`, `valid_from`, `valid_to`, `status` (`draft|pending_approval|active|expired|archived`), `allow_unlisted_products`, `auto_sync_from_source`, `rounding_rule`, `version`, `kiotviet_ref`, `created_by`, `approved_by`, timestamps.
- `price_book_items`: `price_book_id`, `product_id`, `sku_snapshot`, `name_snapshot`, `unit_snapshot`, `base_price`, `price`, `discount_percent`, `discount_amount`, `min_qty`, `order_step`, `effective_from/to`, source metadata, unique theo price book + product.
- `price_book_customer_assignments`, `price_book_customer_group_assignments`, `price_book_user_assignments`, `price_book_branch_assignments`.
- `customer_operations_assignments`: khách, phòng vận hành, sale phụ trách, chi nhánh, hiệu lực.
- `price_book_import_jobs`, `price_book_import_rows`, `price_book_audit_logs` để lưu preview, lỗi, người duyệt, rollback/audit.

### 3.2. Đơn hàng

Migration `20260923_order_pricing_snapshot.sql`:

- orders: `price_book_id`, `price_book_version`, `pricing_status`, `price_locked_at`, `customer_price_source`, `delivery_date`, `delivery_shift`, `branch_id`, `department_id`.
- order items: `general_unit_price`, `assigned_unit_price`, `discount_percent`, `discount_amount`, `final_unit_price`, `manual_price`, `manual_price_reason`, `price_source`, `product_name_snapshot`, `unit_snapshot`, `packaging_note`, `min_qty_snapshot`, `order_step_snapshot`.
- `order_change_requests`: loại thay đổi, lý do, trước/sau, trạng thái, người tạo/duyệt, thông báo khách.
- `order_merge_audit`: đơn cha, đơn cũ, điều kiện gộp, người gộp, thời điểm; trạng thái đơn cũ là `merged`, không delete.
- `order_documents`: loại tài liệu, version, file/path/hash, generated_by; xác nhận PDF phải gắn với snapshot chốt giá.

Migration `20260923_product_order_constraints.sql`:

- sản phẩm: `min_order_qty`, `order_step`, `enforce_order_step`, `packaging_note`, `quantity_precision`.
- Kiểm tra ở UI và API/RPC; không tin dữ liệu từ trình duyệt.

## 4. Quy tắc tính giá

1. Lấy bảng giá khách cụ thể còn hiệu lực.
2. Nếu thiếu dòng nhưng bảng giá chung có giá hợp lệ: lấy bảng giá chung và gắn `price_source=general_fallback`.
3. Nếu cả bảng giá riêng và bảng giá chung đều không có giá: tạo cảnh báo để Vận hành liên hệ Thu mua; chỉ người có quyền mới được nhập giá thủ công.
4. Giá thủ công luôn cần lý do và audit; chỉ vai trò được cấp quyền mới được xác nhận.
5. Khi xác nhận: chụp snapshot toàn bộ giá/chiết khấu/quy cách; thay đổi bảng giá sau đó không làm thay đổi đơn.
6. Blank trong file import = thiếu giá; số 0 chỉ hợp lệ khi người dùng xác nhận “giá 0”. Không tự fuzzy-match tên sản phẩm.
7. Match import theo thứ tự: SKU exact → tên chuẩn hoá + đơn vị exact → hàng “mơ hồ/chưa tìm thấy” để người dùng xử lý. Không tự gộp hai SKU gần giống.

## 5. Tasklist giao Gemini

### G0 — Khoá hiện trạng và an toàn

- [ ] Đọc file này, `HANDOFF_CONTEXT.md`, migrations hiện có và liệt kê file sẽ sửa.
- [ ] Tạo backup/schema diff; không chạy `DROP`, không xoá dữ liệu production.
- [ ] Viết data dictionary và mapping cũ (`customer_contract_prices`, `product_tier_prices`, VIP) sang bảng giá mới.
- [ ] Bổ sung test fixture: một khách có bảng riêng, khách chỉ có bảng chung, giá thiếu, giá 0, override.

### G1 — Price book API + database

- [ ] Tạo 3 migration nêu ở mục 3, có RLS, index theo `status/valid_from/valid_to/customer/product` và audit.
- [ ] API CRUD draft/submit/approve/activate/archive; API assign theo khách/nhóm/user/chi nhánh.
- [ ] API resolve giá trả về cả giá chung, giá riêng, nguồn giá và lý do fallback; cache theo customer + pricebook version.
- [ ] API import Excel dạng template 5 cột; preview matched/unmatched/ambiguous/invalid/blank-vs-zero; commit idempotent.
- [ ] Không cho import ghi đè active book nếu chưa tạo version/draft.

### G2 — Import bảng giá phức tạp

- [ ] Cho chọn workbook/sheet, dòng header, cột SKU/tên/đơn vị.
- [ ] Hỗ trợ cặp cột giá + chiết khấu và nhiều cột bếp/khách từ workbook tháng 09/26.
- [ ] Hiển thị 20 dòng mẫu trước commit; xuất file lỗi để sửa và nhập lại.
- [ ] Kiểm thử với cả `MauFileBangGia.xlsx`, hai file `BangGia_KV...` và workbook nhiều header.

### G3 — Quản lý khách và phân quyền

- [ ] Màn hình khách: bảng giá đang áp dụng, bảng giá chung, phòng vận hành, sale phụ trách, hiệu lực.
- [ ] Tạo/sửa user chọn phòng ban + chức danh + chi nhánh; quyền theo capability, không hard-code tên.
- [ ] Ma trận Phase 1: Vận hành xem/tạo/xử lý/chăm sóc/xác nhận quy trình đơn; Thu mua xem đơn và điều chỉnh chuyên môn về hàng/giá chung; Kế toán tạo bảng giá riêng và quản lý công nợ; CEO duyệt/kích hoạt bảng giá và ngoại lệ; Admin toàn quyền.
- [ ] Các quyền duyệt giá đặc biệt và điều chỉnh sau xác nhận phải yêu cầu đúng vai trò, không cho Vận hành tự duyệt thay CEO.
- [ ] Log mọi thay đổi bảng giá, gán khách, giá thủ công, trạng thái đơn.

### G4 — Đặt hàng web + Mini App

- [ ] Welcome trước đăng nhập; xem danh mục nhanh; đăng nhập/đăng ký; sau đăng nhập tải giá hiệu lực.
- [ ] Tìm kiếm server-side có debounce, phân trang, ảnh, đơn vị/quy cách; không tải toàn bộ 5.000+ sản phẩm ở lần đầu.
- [ ] Reorder, yêu thích, mua thường xuyên; giỏ lưu bền và không mất khi login.
- [ ] Kiểm tra min/step/đơn vị trước add và trước submit; hiển thị ngày giao + ca giao theo cấu hình cutoff.
- [ ] Tài khoản khách được sửa thông tin/địa chỉ; địa chỉ mặc định tự điền vào đơn.

### G5 — Luồng đơn và gộp đơn

- [ ] Chuẩn hoá Phase 1: `Đã đặt hàng → Vận hành kiểm tra/Đang xử lý → Vận hành phối hợp Thu mua bổ sung/điều chỉnh → Chờ người có quyền xác nhận giá → Đã xác nhận + PDF → Đơn tổng/đơn theo xe → Đang soạn hàng → Đang giao → Hoàn thành`; nhánh `Yêu cầu điều chỉnh`, `Giao thiếu/đổi`, `Đã gộp`, `Đã huỷ`.
- [ ] Không tạo một trạng thái bắt buộc “chuyển Thu mua” làm điểm dừng; Thu mua là bộ phận phối hợp trong trạng thái xử lý, còn Vận hành giữ chủ đơn.
- [ ] Chỉ xác nhận khi giá đủ và snapshot đã khoá; tạo PDF xác nhận có version.
- [ ] Cho khách/sale gửi yêu cầu điều chỉnh trước xác nhận; sau xác nhận chỉ sale/thu mua/trưởng phòng theo quyền.
- [ ] Gộp đơn có preview, kiểm tra cùng mã khách/ngày/địa chỉ, chọn đơn chính, ghi audit và đánh dấu đơn tạm cũ `Đã gộp`.
- [ ] Sau xác nhận xuất đơn tổng, đơn chi tiết, đơn theo xe; filter theo ngày giao/nhóm hàng/tuyến.

### G6 — Soạn hàng, thiếu/đổi và công nợ

- [ ] Màn hình đơn tổng cho thu mua: tổng nhu cầu theo SKU, đơn vị, quy cách, khách/đơn con, số lượng đã soạn/thiếu.
- [ ] Ghi nhận thiếu/đổi/trả với lý do, người chịu trách nhiệm, thời hạn xử lý; không sửa ngầm dòng đã xác nhận.
- [ ] Payment mode gồm `COD`, `Đã thanh toán`, `Công nợ`; lưu hạn mức/điều khoản ở khách và snapshot trên đơn.
- [ ] Sau giao hàng, sale/vận hành cập nhật bằng chứng; kế toán đối chiếu công nợ và xuất hoá đơn.

### G7 — QA và go-live

- [ ] Unit/integration tests cho resolve giá, import, min-step, cutoff, merge, override, RLS.
- [ ] E2E: khách mới → đăng ký → đặt đơn; khách có bảng riêng → giá đúng; sale → thêm hàng/giá; thu mua → đơn tổng; giao thiếu → change request; kế toán → công nợ.
- [ ] Test responsive desktop/mobile, Mini App và web cùng API.
- [ ] Load test tối thiểu 150 đơn/ngày, 5.000 sản phẩm, 100 người dùng đồng thời ở giờ chốt.
- [ ] Staging chạy dữ liệu mẫu; chỉ migrate dữ liệu thật sau sign-off và có rollback.

## 6. Tiêu chí nghiệm thu

- Không còn logic bắt buộc “VIP = bảng giá”.
- Đơn giao ngày hôm sau sau 17:00 bị cảnh báo/chặn đúng chính sách; ngoại lệ có audit.
- Vận hành có thể xử lý một đơn xuyên suốt mà không phải chuyển trách nhiệm sang Thu mua; Thu mua vẫn xem và cập nhật phần chuyên môn được cấp quyền.
- Bảng giá chung do Thu mua cấp, bảng riêng do Kế toán tính/upload, CEO duyệt/kích hoạt; upload chưa duyệt không được áp dụng.
- Khi bảng riêng thiếu dòng, giá chung được dùng và hiển thị rõ nguồn fallback.
- Một khách có thể có bảng giá riêng theo thời hạn; giá hiển thị và giá trong đơn khớp.
- Import được template 5 cột và workbook nhiều cột có preview/lỗi; không tạo SKU trùng.
- Đơn chỉ chuyển `Đã xác nhận` khi đủ giá; PDF và file đơn tổng tái hiện đúng snapshot.
- Gộp đơn không mất audit; đơn cũ không xuất hiện trong tổng nhu cầu hai lần.
- Tài khoản/nhân viên bị giới hạn đúng phòng ban; Admin vẫn toàn quyền.
- Đặt số lượng sai quy cách bị chặn cả client lẫn server; quá cutoff hiển thị đúng cấu hình.
- Các file mẫu của KiotViet được lưu làm fixture kiểm thử, không đưa dữ liệu nhạy cảm lên Git.

## 7. Những việc Gemini không được làm

- Không xoá hoặc sửa trực tiếp dữ liệu đơn cũ để “làm sạch”.
- Không fallback giá bằng VIP nếu đã có price book nhưng thiếu dòng mà bảng giá không cho hàng ngoài.
- Không import mơ hồ theo tên gần giống; không biến blank thành 0.
- Không cho client tự gửi giá cuối để server tin tưởng.
- Không hard-code cutoff, phòng ban, tên sale, chi nhánh.
- Không đưa service-role key, file Excel khách hàng, công nợ hoặc ảnh chứng từ vào Git.

## 8. Prompt bàn giao cho Gemini

> Đọc toàn bộ file `docs/GEMINI_TPS1_PRICEBOOK_ORDER_REBUILD_PLAN.md` và các migration/API hiện có trước khi code. Triển khai Phase 1 theo đúng luồng: `Khách/Sale đặt hàng → Đã đặt hàng → Vận hành kiểm tra/xử lý → Vận hành phối hợp Thu mua bổ sung/điều chỉnh → CEO/role được uỷ quyền duyệt giá → Đã xác nhận + PDF → Đơn tổng/đơn theo xe → Soạn hàng → Đang giao → Hoàn thành`. Mốc chốt đơn là 17:00. Thu mua cấp bảng giá chung; Kế toán tính và upload bảng giá riêng; CEO duyệt/kích hoạt; bảng riêng thiếu sản phẩm thì fallback bảng chung. Vận hành giữ chủ đơn xuyên suốt Phase 1. Bắt đầu bằng G0 và G1, tạo migration backward-compatible, preview diff và test trước khi sửa UI. Không xoá dữ liệu, không đổi schema production trực tiếp, không tự activate bảng giá chưa duyệt. Sau mỗi nhóm thay đổi phải báo file đã sửa, migration, test đã chạy và rủi ro còn lại.
