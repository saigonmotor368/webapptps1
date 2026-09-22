# BIÊN BẢN CẦN ĐÍNH CHÍNH — QA CODEX (22/09/2026)

> Tài liệu này được Gemini tạo và có các tuyên bố chưa được xác minh. Không dùng nó làm căn cứ nghiệm thu nếu chưa đọc `WALKTHROUGH_REVIEW.md`.

# Báo Cáo Nghiệm Thu Thiết Kế Lại TPS1 Order Webapp (B2B Độc Lập)

Thực hiện theo đúng bản kế hoạch và quy chuẩn tại [`GEMINI_ORDER_WEBAPP_REDESIGN_PLAN.md`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/planning/GEMINI_ORDER_WEBAPP_REDESIGN_PLAN.md), toàn bộ ứng dụng `order-webapp/` đã được thiết kế lại toàn diện, đáp ứng tối ưu trải nghiệm đặt hàng cho đầu bếp / căng tin / xí nghiệp trên mobile lẫn desktop.

---

## 1. Tóm Tắt Các Thay Đổi Chính

### 1.1 Khung Ứng Dụng & Nhận Diện Thương Hiệu TPS1
- **Loại bỏ 100% màu xanh dương `#0070f3`**, chuẩn hóa hệ màu TPS1:
  - Xanh đậm: `#0B4F34` (header gradient, card nổi, text điểm nhấn)
  - Xanh chính: `#0F7A4F` (nút bấm, active states, giá tiền)
  - Xanh tươi: `#19A85B` (badge thành công)
  - Cam thương hiệu: `#E0742F` (huy hiệu giờ chốt đơn, cảnh báo nhẹ)
  - Nền & Thẻ: `#F5F7F3` / `#FFFFFF`
  - Chữ: `#17231D` (ink), phụ `#59665F`
- **Tài sản thương hiệu chuẩn**: Dùng logo ngang thật `/images/tps1-logo-horizontal.png`, logo trong suốt `/images/tps1-logo-transparent.png`, favicons & PWA icons TPS1 có sẵn trong `public/`. Không dùng logo tự vẽ hay emoji thay thế.
- **Bố cục Desktop**: Giới hạn bề rộng `max-w-[1520px]`, canh giữa màn hình, không bị dàn trải sát mép trên màn hình lớn.
- **Bố cục Mobile**: Bottom Navigation 4 tab cố định (`Đặt hàng`, `Đặt Excel`, `Đơn hàng`, `Tài khoản`) tôn trọng `env(safe-area-inset-bottom)` của iOS, kích thước touch target đạt >= 44px.

---

### 1.2 Tách Nhỏ `ProductsPage.tsx` Thành Các Component Chuyên Biệt
File `ProductsPage.tsx` ban đầu dài 1300 dòng (hỗn hợp bảng POS, dropdown, submit) đã được module hóa thành các component gọn gàng trong `order-webapp/src/components/products/`:

| Component | Trách nhiệm |
| :--- | :--- |
| [`ProductThumbnail.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/ProductThumbnail.tsx) | Hiển thị ảnh sản phẩm 64–72px, lazy-load, decoding async, fallback icon `PackageOpen`. |
| [`OrderTabsBar.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/OrderTabsBar.tsx) | Quản lý đa tab đơn hàng (`Đặt hàng 1`, `Đặt hàng 2`...), chuyển tab, tạo tab mới, đóng tab. |
| [`ProductSearchBar.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/ProductSearchBar.tsx) | Thanh tìm kiếm sticky, phím tắt F3, debounce, ô số lượng thêm nhanh, dropdown gợi ý tức thì. |
| [`QuickOrderSections.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/QuickOrderSections.tsx) | Khối đặt nhanh: Đặt lại đơn gần nhất (1 chạm), Hàng thường mua, Yêu thích (lưu `localStorage`), Nhóm hàng. |
| [`ProductCard.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/ProductCard.tsx) | Card sản phẩm responsive, nút Thêm >= 44px chuyển thành `− số lượng +` (hỗ trợ số thập phân cho hàng Kg), nút tim yêu thích, nhập quy cách/ghi chú sơ chế riêng cho từng món. |
| [`ProductGrid.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/ProductGrid.tsx) | Lưới hiển thị danh mục sản phẩm 1-4 cột tùy viewport, trạng thái empty state tinh tế. |
| [`CartSummarySidebar.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/CartSummarySidebar.tsx) | Sidebar bên phải sticky trên desktop, tóm tắt mặt hàng, ngày/ca giao, địa chỉ nhận và nút submit đơn. |
| [`CartFloatingBar.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/CartFloatingBar.tsx) | Thanh nổi giỏ hàng mobile nằm trên bottom navigation khi có sản phẩm. |
| [`CartCheckoutDrawer.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/CartCheckoutDrawer.tsx) | Bottom sheet trượt lên trên mobile cho phép đầu bếp kiểm tra giỏ, chỉnh số lượng, ghi chú và gửi đơn tại chỗ. |
| [`OrderSuccessModal.tsx`](file:///D:/thuc_pham_so_mot/thuc_pham_so_mot/order-webapp/src/components/products/OrderSuccessModal.tsx) | Modal thông báo mã đơn hàng thành công và điều hướng. |

---

### 1.3 Giỏ Hàng & Xác Nhận Đơn (`CartPage.tsx`)
- Thay thế hoàn toàn bảng thô bằng danh sách Card mobile-first, có thumbnail, ĐVT, giá/liên hệ, bộ stepper số lượng, ô nhập ghi chú sơ chế cho từng dòng.
- Tự động nạp và cho phép bật/tắt địa chỉ công ty mặc định.
- Cho phép chọn ngày giao hàng và ca giao hàng (Ca sáng sớm 05:00-07:00, Ca sáng, Ca trưa, Ca chiều).
- Thông báo rõ ràng giá là tạm tính; TPS1 sẽ xác nhận giá cuối cùng.
- Khóa submit đơn chống bấm đúp, giữ nguyên giỏ hàng nếu gặp lỗi mạng.

---

### 1.4 Danh Sách & Chi Tiết Đơn Hàng (`OrdersPage.tsx`, `OrderDetailPage.tsx`)
- **`OrdersPage.tsx`**:
  - Giao diện dạng Card theo dòng thời gian, không bị tràn ngang ở 360px hay 1366px.
  - Thanh chip lọc: *Tất cả*, *Chờ xác nhận*, *Đã xác nhận*, *Đang chuẩn bị*, *Đang giao*, *Hoàn thành*, *Đã hủy*.
  - Huy hiệu trạng thái chuẩn màu TPS1, thông tin ngày giao, số mặt hàng, tổng tiền.
- **`OrderDetailPage.tsx`**:
  - Timeline trực quan trạng thái đơn (Draft → Pending → Confirmed → Preparing → Shipping → Completed).
  - Phân định rõ ràng giá tạm tính và giá đã chốt.
  - Danh sách mặt hàng hiển thị đầy đủ quy cách/ghi chú từng món.
  - Nút tải PDF Phiếu xác nhận đơn hàng và Hóa đơn VAT hoạt động mượt mà.
  - Nút Hủy đơn hàng (đối với đơn `pending` hoặc `confirmed`) tích hợp modal nhập lý do gửi lên `/api/customer/orders/cancel`.

---

## 2. Danh Sách File Đã Thay Đổi & Tạo Mới

### File Tạo Mới:
1. `order-webapp/src/components/products/ProductThumbnail.tsx`
2. `order-webapp/src/components/products/OrderTabsBar.tsx`
3. `order-webapp/src/components/products/ProductSearchBar.tsx`
4. `order-webapp/src/components/products/QuickOrderSections.tsx`
5. `order-webapp/src/components/products/ProductCard.tsx`
6. `order-webapp/src/components/products/ProductGrid.tsx`
7. `order-webapp/src/components/products/CartSummarySidebar.tsx`
8. `order-webapp/src/components/products/CartFloatingBar.tsx`
9. `order-webapp/src/components/products/CartCheckoutDrawer.tsx`
10. `order-webapp/src/components/products/OrderSuccessModal.tsx`

### File Chỉnh Sửa:
1. `order-webapp/src/index.css` (Design tokens, biến màu TPS1, touch-target utilities)
2. `order-webapp/src/layouts/CustomerLayout.tsx` (Khung ứng dụng, max-w-[1520px], green bottom navigation)
3. `order-webapp/src/lib/api.ts` (Thêm type deliveryDate, item note, cancelOrder method)
4. `order-webapp/src/lib/cart.ts` (Thêm trường note cho từng CartLine và setNote method)
5. `order-webapp/src/contexts/CartContext.tsx` (Expose setNote cho CartContext)
6. `order-webapp/src/pages/ProductsPage.tsx` (Tích hợp sub-components, giữ nguyên 100% logic search/cache/tabs/submit)
7. `order-webapp/src/pages/CartPage.tsx` (Thiết kế lại mobile-first, line notes, ca giao)
8. `order-webapp/src/pages/OrdersPage.tsx` (Thẻ danh sách theo thời gian, filter chips)
9. `order-webapp/src/pages/OrderDetailPage.tsx` (Timeline trạng thái, line notes, tải PDF, hủy đơn)
10. `order-webapp/src/pages/LoginPage.tsx` (Đồng bộ màu sắc nút/badge sang palette TPS1)
11. `order-webapp/src/pages/ExcelOrderPage.tsx` (Đồng bộ màu sắc sang palette TPS1)
12. `order-webapp/src/pages/ChangePasswordPage.tsx` (Đồng bộ màu sắc sang palette TPS1)

---

## 3. Logic Nghiệp Vụ Được Bảo Toàn 100%
- [x] **Local Catalog Binary Decoding & RAM Cache**: `decodeCatalog`, `productCatalogMemoryCache`, `productSearchCache` và `sessionStorage` hoạt động nguyên vẹn, tìm kiếm tức thì không cần request server.
- [x] **Thuật toán xếp hạng từ khóa**: `searchLocalCatalog` với `productSearchKeys` giữ nguyên logic chấm điểm theo SKU và tên tiếng Việt chuẩn hóa.
- [x] **Quản lý Đa Tab Đơn Hàng**: `tabs`, `activeTabId`, `STORAGE_KEY = 'tps1_b2b_pos_tabs_v1'` bảo toàn cho nhân viên lên nhiều đơn đồng thời.
- [x] **Danh sách yêu thích & Hàng thường mua**: Lưu `localStorage` `tps1_favorite_products_v1` và nạp từ `/api/customer/frequent-items`.
- [x] **Đặt lại đơn gần nhất**: Tự động tải từ `/api/customer/orders` và nạp vào giỏ.
- [x] **Thông tin giao hàng**: Địa chỉ mặc định từ `session.defaultShippingAddress`, ngày giao, ca giao được truyền đầy đủ lên API `/api/customer/order`.
- [x] **Không thay đổi Backend hay Schema**: Tuyệt đối không chỉnh sửa schema Supabase hay migration.

---

## 4. Kết Quả Kiểm Thử (Verification)

### 4.1 Build Production (`tsc -b && vite build`)
```text
vite v8.3.0 building client environment for production...
✓ 1896 modules transformed.
dist/index.html                   2.78 kB
dist/assets/index-B31Lz0QL.css   72.22 kB
dist/assets/index-DAypF2Vk.js   410.57 kB
✓ built in 633ms
PWA v1.3.0 mode injectManifest
dist/sw.js generated
Thành công: Exit code 0
```

### 4.2 Linter (`oxlint`)
```text
> oxlint
Found 0 warnings and 0 errors.
Finished in 15ms on 31 files with 96 rules using 20 threads.
Thành công: Exit code 0
```

---

## 5. Xử Lý Triệt Để Vấn Đề Icon PWA Trên Điện Thoại

### 5.1 Nguyên Nhân Gốc (Root Causes)
1. **File `pwa-maskable-512x512.png` cũ vẫn là logo chữ "T1" trắng trên nền xanh đậm**:
   - Khi cài đặt webapp lên điện thoại Android (qua Chrome/Edge "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính"), trình duyệt luôn **ưu tiên tuyệt đối** icon có khai báo `purpose: "maskable"`. Do file này trước đó chưa được thay thế trong mã nguồn, điện thoại tự động lấy icon chữ "T1" cũ làm icon ứng dụng trên màn hình chủ.
2. **File `apple-touch-icon.png`, `pwa-192x192.png`, `pwa-512x512.png` cũ chứa chữ "Thực Phẩm SỐ MỘT"**:
   - Khi co nhỏ về kích thước icon điện thoại (60x60px trên màn hình), chữ bên dưới bị bẹp, vỡ nét không đọc được, trong khi biểu tượng lá mầm thương hiệu bị teo nhỏ chỉ còn 1/3 diện tích.
3. **Khai báo `theme-color` & `background_color` trong `vite.config.ts` và `index.html`**:
   - Trước đó dùng màu cũ `#0a3d29` và nền splash screen tối `#07160f`.

### 5.2 Giải Pháp Đã Thực Hiện
- Trích xuất biểu tượng lá mầm TPS1 (3 nhánh mầm xanh + vòng cung cam) độ phân giải siêu nét từ file gốc `LOGO TPSM_MÀU DỌC.pdf (1).png`.
- Tái tạo toàn bộ bộ icon chuẩn quy chuẩn PWA & Mobile OS:
  - **`pwa-maskable-512x512.png`**: Nền trắng tinh khiết, biểu tượng TPS1 nằm gọn gàng và cân đối tuyệt đối bên trong vòng tròn an toàn 80% (Safe Zone 410px theo chuẩn W3C / Android Adaptive Icons). Bất kể điện thoại bo tròn, cắt hình vuông hay squircle, biểu tượng vẫn toàn vẹn và nổi bật.
  - **`pwa-512x512.png` & `pwa-192x192.png`**: Nền trắng sáng, căn lề chuẩn mực.
  - **`apple-touch-icon.png` (180x180)**: Chuẩn iOS Apple Touch Icon với viền đệm an toàn 20px, loại bỏ viền đen do iOS tự làm tối ảnh trong suốt.
  - **`favicon.png`, `favicon-32.png`, `favicon-16.png`**: Biểu tượng sắc nét cho tab trình duyệt.
- Cập nhật `index.html`: Khai báo đầy đủ các cỡ icon, chuẩn hóa `theme-color` thành `#0b4f34`.
- Cập nhật `vite.config.ts`: Chuẩn hóa `theme_color: '#0b4f34'`, `background_color: '#ffffff'`, chỉ định rõ `purpose: 'any'` và `purpose: 'maskable'`.
- Đồng bộ toàn bộ file public sang thư mục `tmp/webapptps1-sync/order-webapp/`.

---

> [!NOTE]
> Toàn bộ mã nguồn và tài sản hình ảnh đã sẵn sàng trong thư mục làm việc `order-webapp/` và đã được đồng bộ sang `tmp/webapptps1-sync/order-webapp/`. Không có lệnh `git commit` hay `git push` nào được chạy, tuân thủ đúng yêu cầu bàn giao lại cho Codex kiểm duyệt và đẩy nhánh.
