# TPS1 — G2: Import bảng giá phức tạp

## Biên bản nghiệm thu G1.2

G1.2 được chấp nhận theo kết quả staging đã cung cấp:

- Giá riêng khách hàng trả về `customer_price_book` đúng giá 95.000đ.
- Sản phẩm thiếu trong bảng riêng fallback bảng chung 150.000đ với `general_fallback`.
- Bảng giá `draft` và `expired` không được chọn.
- Trạng thái `merged` được chấp nhận.
- Resolve API dùng session token, không nhận tuỳ ý `customer_id` từ client.
- TypeScript/build đã đạt trên branch `phase1-pricebook-g1.2`.

Branch đã nghiệm thu: `phase1-pricebook-g1.2`  
Commit: `be6bcd0`

## Mục tiêu G2

Nhập được hai nhóm file:

1. **Template chuẩn:** `MauFileBangGia.xlsx` — cột `Mã hàng`, `Tên hàng`, `Tên bảng giá 1/2/3`.
2. **Workbook thực tế:** `BẢNG TÍNH GIÁ CÁC BẾP TP 09.26.xlsx` — nhiều sheet, header nhiều tầng, nhiều cột bếp/khách, cột giá và chiết khấu đi kèm.

Không được làm hỏng luồng bảng giá chung/bảng giá riêng đã nghiệm thu ở G1.2.

## G2.1 — Upload và chọn nguồn

- [ ] Chỉ nhận `.xlsx`/`.xls`, giới hạn dung lượng và số dòng/cột.
- [ ] Hiển thị tên file, kích thước, checksum và danh sách sheet.
- [ ] Cho người dùng chọn sheet cần nhập; không tự nhập toàn bộ workbook.
- [ ] Cho chọn dòng bắt đầu dữ liệu và dòng/cột header.
- [ ] Không lưu file gốc chứa dữ liệu khách hàng vào Git hoặc public storage.

## G2.2 — Nhận diện cấu trúc bảng

- [ ] Template chuẩn: nhận diện SKU, tên hàng, các cột bảng giá.
- [ ] Workbook nhiều tầng: đọc các dòng header để ghép tên bảng giá và loại cột (`price`, `discount_percent`, `discount_amount`).
- [ ] Bỏ qua dòng tiêu đề nhóm, dòng trống và dòng ghi chú; hiển thị số dòng bị bỏ qua.
- [ ] Cho người dùng sửa mapping trước khi preview.
- [ ] Không suy đoán mơ hồ khi có hai cột cùng tên; bắt buộc chọn thủ công.

## G2.3 — Match sản phẩm

Thứ tự match bắt buộc:

1. SKU/mã hàng exact.
2. Tên đã chuẩn hoá + đơn vị exact.
3. Nếu có nhiều kết quả: `ambiguous`, không tự chọn.
4. Không tìm thấy: `unmatched`, không tự tạo sản phẩm.

- [ ] Chuẩn hoá khoảng trắng, Unicode, hoa/thường và ký tự xuống dòng.
- [ ] Preview có mã nguồn, tên nguồn, mã khớp, tên hệ thống, đơn vị, trạng thái match.
- [ ] Cho tải file lỗi để sửa và nhập lại.

## G2.4 — Xử lý giá và chiết khấu

- [ ] Blank = thiếu giá; không biến blank thành 0.
- [ ] 0 chỉ hợp lệ khi người dùng xác nhận “giá 0 có chủ ý”.
- [ ] Nhận cả giá cuối, phần trăm chiết khấu và số tiền chiết khấu.
- [ ] Lưu giá nguồn + công thức + giá cuối đã tính.
- [ ] Kiểm tra giá âm, chiết khấu ngoài 0–100%, số quá lớn, sai định dạng.
- [ ] Không ghi đè bảng giá `active`; luôn tạo draft/version mới.

## G2.5 — Preview, phê duyệt và commit

- [ ] Preview thống kê tổng dòng, hợp lệ, unmatched, ambiguous, blank, zero và lỗi giá.
- [ ] Cho chọn chỉ commit dòng hợp lệ hoặc huỷ khi còn lỗi.
- [ ] Tạo `price_book_import_jobs` và lưu từng dòng vào `price_book_import_rows`.
- [ ] Commit idempotent theo checksum + price book + version.
- [ ] Sau commit, bảng giá ở `draft` hoặc `pending_approval`, chưa được áp dụng.
- [ ] Chỉ CEO/role được uỷ quyền mới chuyển sang `active`.
- [ ] Ghi audit file, sheet, mapping, checksum, số dòng, người nhập, người duyệt, thời điểm.

## G2.6 — Gán bảng giá

- [ ] Gán bảng giá theo khách cụ thể hoặc nhóm khách/bếp.
- [ ] Không có hai bảng giá cùng priority và cùng hiệu lực cho một khách.
- [ ] Hiển thị ngày bắt đầu/kết thúc và bảng giá đang hiệu lực.
- [ ] Khi thay bảng giá, tạo version mới; không sửa snapshot của đơn cũ.

## G2.7 — Kiểm thử bắt buộc

- [ ] `MauFileBangGia.xlsx` với 3 bảng giá.
- [ ] Hai file `BangGia_KV22092026-213634-533.xlsx` và `BangGia_KV22092026-164602-820.xlsx`.
- [ ] Workbook `BẢNG TÍNH GIÁ CÁC BẾP TP 09.26.xlsx` với nhiều sheet/header.
- [ ] Tên sản phẩm trùng nhưng khác đơn vị, SKU không tồn tại.
- [ ] Blank, giá 0, giá âm, chiết khấu 0%, chiết khấu >100%.
- [ ] Hai lần import cùng checksum.
- [ ] Người không có quyền upload/approve/activate.
- [ ] Resolve giá trước và sau khi activate version mới.

## G2.8 — Hiệu năng và an toàn

- [ ] Parse Excel ở server/background job, không block request UI dài.
- [ ] Preview theo trang, không trả toàn bộ 5.000+ dòng một lần.
- [ ] Upsert theo batch, có transaction và rollback khi commit lỗi.
- [ ] Không log token, service-role key, công nợ hoặc file Excel nhạy cảm.
- [ ] Có giới hạn kích thước file, số dòng và timeout.

## Tiêu chí hoàn tất G2

- Import được template chuẩn và workbook nhiều tầng mà không tạo SKU trùng.
- Người dùng thấy rõ mọi dòng unmatched/ambiguous/blank/zero trước commit.
- Bảng giá mới không áp dụng trước khi CEO activate.
- Resolve giá sau activate trả đúng giá riêng/fallback như G1.2.
- Import lại cùng file không nhân đôi dữ liệu.
- Rollback version draft không ảnh hưởng bảng giá active hoặc đơn đã chốt.
- UI hoạt động tốt trên desktop/mobile và không làm chậm màn hình đặt hàng.
