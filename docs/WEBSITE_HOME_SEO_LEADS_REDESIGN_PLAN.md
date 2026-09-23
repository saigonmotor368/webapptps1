# Website TPS1 — Home, Catalog, SEO và Lead Funnel

## Mục tiêu

Website chính là kênh giới thiệu thương hiệu và thu lead. Không xử lý giỏ hàng/checkout tại đây; mọi đặt hàng chuyển sang `https://dathang.thucphamsomot.vn/`.

## Nguyên tắc nội dung

- Mỗi trang có một search intent và một CTA chính.
- Không công khai giá bán chung nếu giá phụ thuộc khách hàng/sản lượng.
- CTA nhất quán: `Nhận báo giá`, `Gọi tư vấn`, `Chat Zalo`, `Đặt hàng trên Cổng Đối Tác`.
- Nội dung phải nói rõ TPS1 phục vụ ai, khu vực nào, nhóm hàng nào, lịch giao và hồ sơ chứng từ.
- Không tạo landing page địa phương trùng lặp nội dung; mỗi khu vực phải có thông tin tuyến giao, ngành phục vụ và bằng chứng riêng.

## Cấu trúc trang chủ

1. Hero: “Nhà cung cấp thực phẩm B2B cho bếp ăn, nhà máy và trường học” + 2 CTA `Nhận báo giá` / `Xem sản phẩm`.
2. Trust strip: hồ sơ ATTP, giao định kỳ, VAT, phản hồi nhanh.
3. Nhóm sản phẩm: rau củ, thịt cá, đông lạnh, khô/gia vị; mỗi card dẫn tới trang danh mục SEO.
4. Ngành phục vụ: bếp công nghiệp, trường học, bệnh viện, nhà hàng/khách sạn.
5. Năng lực vận hành: nguồn hàng, kiểm hàng, giao theo tuyến, xử lý phát sinh.
6. Quy trình 3 bước: gửi nhu cầu → nhận báo giá → xác nhận lịch cung ứng.
7. Lead form ngắn, có upload danh sách và UTM.
8. FAQ có schema.
9. CTA cuối: gọi/Zalo/form báo giá.

## Trang sản phẩm

- `/san-pham`: danh mục có filter nhóm hàng, tìm kiếm server-side và pagination.
- `/danh-muc/[slug]`: nội dung giới thiệu nhóm hàng, quy cách, ngành phù hợp, FAQ và sản phẩm tiêu biểu.
- `/san-pham/[slug]`: ảnh tối ưu, SKU, đơn vị, quy cách, mô tả, thông tin chứng từ và CTA báo giá.
- Không render cart/floating cart trên website chính.
- Nút `Đặt hàng trên Cổng Đối Tác` mở webapp đặt hàng; khách chưa đăng nhập được hướng dẫn đăng nhập/đăng ký ở webapp.

## SEO/Ads

- Metadata, canonical, hreflang VI/EN, Open Graph, sitemap và robots cho mọi route.
- JSON-LD: Organization, LocalBusiness, Product, ItemList, BreadcrumbList, FAQPage.
- Landing page theo ngành và khu vực, mỗi trang có nội dung thực tế và CTA riêng.
- Ghi nhận `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `fbclid` vào lead.
- Event: `lead_form_view`, `lead_form_submit`, `click_call`, `click_zalo`, `click_view_product`, `click_open_order_app`, `upload_buying_list`.
- Thank-you page riêng để đo chuyển đổi Google Ads.

## Tối ưu tốc độ

- Hero chỉ dùng một ảnh AVIF/WebP responsive; preload đúng ảnh LCP, không tải ảnh phụ trước viewport.
- Lazy-load các section dưới fold và ảnh catalog.
- Dynamic import `ThreeBackground` hoặc bỏ hiệu ứng 3D trên mobile/Save-Data.
- Giảm `quality` ảnh hero, khai báo `sizes`, không dùng ảnh nền lớn hơn kích thước hiển thị.
- Không tải catalog 5.000+ sản phẩm ở homepage.
- Tách provider/giỏ hàng/customer session khỏi các route marketing khi không cần.
- Không tải Google Ads/Meta script trước khi page interactive; cân nhắc consent và chỉ bật đầy đủ trên landing có tracking.
- Server-render nội dung SEO; chỉ form, upload và event mới là client component.
- Kiểm tra Lighthouse mobile/desktop, LCP < 2.5s, CLS < 0.1, INP tốt và JS initial nhỏ.

## Tasklist triển khai

### W1 — Homepage

- [ ] Đổi hero theo thông điệp B2B + CTA lead/catalog.
- [ ] Giữ lại nội dung trust/ngành/khu vực nhưng rút gọn phần lặp.
- [ ] Đưa lead form xuống section riêng, không nhồi form lớn vào hero trên mobile.
- [ ] Bỏ các đường dẫn giỏ hàng/báo giá kiểu checkout.

### W2 — Catalog

- [ ] Sửa mọi CTA sản phẩm sang form báo giá hoặc webapp đặt hàng.
- [ ] Bổ sung ảnh, alt, SKU, đơn vị, quy cách.
- [ ] Tạo Product/ItemList/Breadcrumb JSON-LD.
- [ ] Giữ route cũ và redirect có kiểm soát nếu đổi URL.

### W3 — Performance

- [ ] Dynamic import/disable Three.js mobile.
- [ ] Audit bundle và provider toàn cục.
- [ ] Tối ưu ảnh, preload LCP, lazy-load below-fold.
- [ ] Lighthouse trước/sau và kiểm tra WebPageTest nếu cần.

### W4 — Lead + Ads

- [ ] Lưu UTM và click ID.
- [ ] Chuẩn hoá event/conversion.
- [ ] Thank-you page và CTA gọi/Zalo.
- [ ] Test form, upload Excel/PDF, webhook quản lý.

## Nghiệm thu

- Website không còn giỏ hàng/checkout đặt hàng.
- Tất cả CTA đặt hàng dẫn đúng `dathang.thucphamsomot.vn`.
- Form lead hoạt động desktop/mobile và giữ UTM.
- Trang sản phẩm có ảnh, schema, canonical và CTA rõ.
- Homepage không gọi API catalog lớn ở lần tải đầu.
- Lighthouse mobile đạt tối thiểu 90, LCP mục tiêu dưới 2,5 giây.
- Không ảnh hưởng G2 bảng giá và webapp đặt hàng.
