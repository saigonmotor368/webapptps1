# Biên bản bàn giao redesign TPS1 Order Webapp

Ngày rà soát: 22/09/2026  
Phạm vi: `order-webapp/` theo `planning/GEMINI_ORDER_WEBAPP_REDESIGN_PLAN.md`

## Kết quả

Giao diện đặt hàng đã được chuyển từ dạng bảng POS sang luồng card responsive cho bếp và khách hàng doanh nghiệp:

- Header desktop và bottom navigation mobile dùng nhận diện TPS1.
- Tìm sản phẩm tức thì từ catalog cache, có debounce/fallback API và dropdown bàn phím.
- Có đặt lại đơn gần nhất, đặt lại từ từng đơn trong lịch sử, thường mua, yêu thích và danh mục.
- Sản phẩm dùng card responsive, ảnh lazy-load, số lượng thập phân và ghi chú quy cách.
- Desktop có giỏ sticky; mobile có floating cart và checkout drawer.
- Thông tin nhận hàng lấy từ địa chỉ mặc định, có ngày và ca giao.
- Lịch sử đơn là card responsive, có bộ lọc trạng thái.
- Chi tiết đơn có timeline, ngày giao, địa chỉ, phương thức/trạng thái thanh toán, ghi chú khách và ghi chú xác nhận tách biệt.
- Chứng từ được gọi đúng là phiếu xác nhận/hóa đơn bán hàng, không tự khẳng định là hóa đơn VAT.

## Các lỗi phát hiện trong lần bàn giao Gemini và đã sửa

- Bản `walkthrough.md` ở thư mục gốc là tài liệu POS Admin cũ, không phải biên bản redesign này.
- Gỡ thông tin chưa được TPS1 xác nhận: số điện thoại thứ hai, số lượng khách hàng, tên khách hàng tham chiếu, chứng nhận, thời gian phục vụ và cam kết tốc độ.
- Sửa mô tả giá theo đúng nghiệp vụ: dùng bảng giá hiện tại; chỉ xác nhận lại mặt hàng cần báo giá hoặc có điều chỉnh.
- Sửa lỗi danh sách trống trong lúc catalog nền chưa tải xong; thêm skeleton và fallback sang API sản phẩm.
- Giữ một `idempotencyKey` cho mỗi đơn đang soạn để retry không tạo đơn trùng.
- Sửa ngày mặc định theo giờ địa phương và chặn chọn ngày quá khứ.
- Đồng bộ ghi chú trên card khi cập nhật từ giỏ mobile.
- Tăng vùng bấm `+/-` mobile lên 44 px và sửa vị trí sticky để không chồng thanh tìm kiếm.
- Bổ sung nút đặt lại ở từng đơn hàng.
- Sửa phần chi tiết thanh toán đang lấy nhầm `payment_status` làm phương thức.
- Giảm tải mobile bằng cách không tải ảnh nền đăng nhập dung lượng lớn ở cột form.

## Kiểm tra kỹ thuật

- `npm run lint`: đạt, không có lỗi.
- `npm run build`: đạt, TypeScript và Vite production build thành công.
- PWA service worker: build thành công.
- Bundle chính tại thời điểm nghiệm thu: khoảng 413 KB, gzip khoảng 117 KB.
- Đã kiểm tra trực quan giao diện đăng nhập ở desktop và viewport mobile 390 × 844.

## Lưu ý nghiệm thu

Không được tuyên bố “hoàn tất toàn bộ” nếu chưa đối chiếu đúng file bàn giao, chưa kiểm tra dữ liệu kinh doanh và chưa chạy lint/build. Nội dung marketing, chứng nhận, khách hàng tham chiếu và số điện thoại chỉ được đưa lên giao diện khi có nguồn TPS1 xác nhận.

Trước khi go-live chính thức vẫn cần UAT bằng tài khoản khách thật cho bốn luồng: tìm/thêm hàng, gửi đơn, đặt lại đơn và tải PDF trên thiết bị mobile thực tế.
