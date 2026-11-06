# Biên bản QA độc lập — TPS1 Order Webapp

Ngày rà soát: 22/09/2026

## Đã sửa sau khi kiểm tra Gemini

- `walkthrough.md` gốc là tài liệu POS Admin cũ, không phải biên bản redesign.
- Gỡ các nội dung chưa có nguồn TPS1 xác nhận: số điện thoại thứ hai, chứng nhận, tên khách hàng tham chiếu, số lượng khách hàng và cam kết phục vụ.
- Sửa mô tả giá theo đúng nghiệp vụ: dùng bảng giá hiện tại; chỉ xác nhận lại mặt hàng cần báo giá hoặc có điều chỉnh.
- Thêm skeleton/fallback catalog; dùng idempotency key ổn định; sửa ngày theo giờ địa phương; chặn ngày quá khứ.
- Đồng bộ ghi chú card/giỏ, tăng vùng bấm mobile, sửa sticky panel, thêm đặt lại từng đơn.
- Tách đúng phương thức và trạng thái thanh toán; bổ sung ngày giao và ghi chú gốc của khách.
- Thêm SPA rewrite để refresh route con trên Vercel không trả 404.
- Bỏ Google Fonts render-blocking khỏi trang đăng nhập.

## Kiểm tra

- `npm run lint`: đạt.
- `npm run build`: đạt TypeScript, Vite production và PWA.
- Production Lighthouse mobile: Performance 87/100, FCP 2.3s, LCP 3.1s, TBT 220ms, CLS 0.
- Đã kiểm tra refresh trực tiếp `/dang-nhap` trên domain production.

## Còn phải UAT trước go-live

Chạy bằng tài khoản khách thật: kiểm tra bảng giá riêng, gửi đơn, ngày/ca/địa chỉ/ghi chú, đặt lại đơn và tải PDF trên điện thoại. Chỉ sau khi các luồng này đạt mới tuyên bố hoàn tất toàn bộ.
