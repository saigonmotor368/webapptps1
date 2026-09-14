# Webapp đặt hàng riêng cho khách — TPS1

Frontend độc lập để khách hàng tự đăng nhập (mã KH + mật khẩu được cấp) và tự
đặt hàng, tách hẳn khỏi `sale-webapp` (app nội bộ cho nhân viên) và khỏi
`/portal` (đã có sẵn trong web chính). Xem mục 14 trong
`ke-hoach-webapp-ban-hang-thay-kiotviet.md` (project TPS1) để biết bối cảnh
đầy đủ và lý do tách riêng.

## Kiến trúc

- App này **không có backend riêng**. Toàn bộ dữ liệu đi qua các route
  `/api/customer/**` đã có sẵn trên web chính (Next.js, cùng codebase với
  `sale-webapp`), xác thực bằng `Authorization: Bearer <orderSessionToken>`.
- Cơ chế Bearer token này vốn được xây cho Zalo Mini App — hầu hết route
  `/api/customer/**` đã hỗ trợ CORS `*` + token từ trước, nên **không cần
  thêm migration hay RPC nào** cho app mới này.
- Chỉ có 2 route trước đây CHỈ đọc được session qua cookie (dùng cho
  `/portal`, cùng origin) — đã được vá thêm để cũng nhận Bearer token và trả
  CORS header, không đổi hành vi cũ cho `/portal`:
  - `app/api/customer/login/route.ts`
  - `app/api/customer/change-password/route.ts`

  (Hai file này nằm trong repo web chính, không nằm trong thư mục
  `order-webapp/` — đã được cập nhật trực tiếp, xem comment 2026-09-14 ở đầu
  mỗi file.)

## Chạy dev cục bộ

```bash
cd order-webapp
npm install
npm run dev
```

Mặc định chạy ở cổng `5174`, proxy `/api` sang `http://localhost:3001` (web
chính chạy dev ở đó, giống quy ước của `sale-webapp`).

## Build production

```bash
npm run build
```

Ra thư mục `dist/` — deploy như một static site / Vite SPA thông thường.

**Lưu ý:** chưa build-check được trong sandbox lúc tạo app này (registry npm
bị chặn ở môi trường cloud lúc đó) — nên chạy `npm install && npm run build`
một lần trên máy thật trước khi deploy để chắc chắn không lỗi biên dịch.

## Deploy lên Vercel (đề xuất)

1. Tạo **project Vercel mới** (KHÔNG dùng chung project với web chính hay
   `sale-webapp`), trỏ vào thư mục `order-webapp/` trong repo (Root
   Directory = `order-webapp`).
2. Framework preset: Vite.
3. Biến môi trường (Production + Preview):
   - `VITE_API_BASE_URL=https://thucphamsomot.vn`
     (URL web chính — nơi thực sự có API `/api/customer/**`).
4. Gắn domain riêng cho app này, ví dụ `dat-hang.thucphamsomot.vn`.
5. Không cần cấu hình gì thêm phía Supabase — app này không gọi Supabase
   trực tiếp.

### CORS

Vì app chạy trên domain khác web chính, các route `/api/customer/**` đã trả
`Access-Control-Allow-Origin: *`. Nếu sau này siết lại CORS theo whitelist
domain cụ thể, nhớ thêm domain của app này (`dat-hang.thucphamsomot.vn` hoặc
domain thật đã chọn) vào danh sách cho phép ở cả 2 route vừa vá và các route
`/api/customer/**` khác.

## Cấp tài khoản cho khách

Không đổi gì ở khâu cấp tài khoản — vẫn dùng đúng luồng đã có (RPC
`verify_customer_login`, cột `must_change_password`) như mô tả ở mục 14.3 của
kế hoạch. Khách đăng nhập lần đầu bằng mật khẩu được cấp → app tự chuyển sang
màn hình bắt buộc đổi mật khẩu (`ProtectedRoute` trong `App.tsx` chặn cứng,
không chỉ ẩn nút).

## Các trang

| Route | Trang |
|---|---|
| `/dang-nhap` | Đăng nhập |
| `/` | Danh sách sản phẩm (đặt hàng) |
| `/gio-hang` | Giỏ hàng + xác nhận giao hàng |
| `/dat-hang/excel` | Đặt hàng bằng file Excel |
| `/don-hang` | Danh sách đơn hàng của khách |
| `/don-hang/:id` | Chi tiết đơn hàng (tải phiếu xác nhận / hoá đơn) |
| `/doi-mat-khau` | Đổi mật khẩu |

## Đã lược bớt so với `sale-webapp` (có thể bổ sung sau nếu cần)

- Không có nút "Xác nhận đơn" ở trang chi tiết đơn hàng — khớp với hành vi
  hiện tại của `MyOrderDetailPage.tsx` trong `sale-webapp` (route API
  `order/confirm` đã có sẵn nhưng chưa được dùng ở đó).
- Giỏ hàng chỉ có 1 giỏ duy nhất (không multi-tab như `DatHangPage.tsx` của
  `sale-webapp`).

## Quan hệ với 2 luồng đặt hàng khách đã có sẵn

Trong lúc lên kế hoạch, phát hiện web chính đã có sẵn 2 nơi khách có thể tự
đặt hàng: (1) `sale-webapp` — đăng nhập chung nhân viên/khách, có route
`/don-hang-cua-toi`, `/dat-hang/excel`; (2) `/portal` trong web chính — cổng
khách hàng riêng, dùng cookie. App `order-webapp` này là lựa chọn thứ 3, độc
lập hoàn toàn, theo quyết định của chủ dự án (deploy domain riêng, không gộp
vào 2 luồng trên). Cả 3 cùng gọi chung `/api/customer/**` nên dữ liệu khách
hàng/đơn hàng luôn nhất quán dù khách dùng cổng nào.
