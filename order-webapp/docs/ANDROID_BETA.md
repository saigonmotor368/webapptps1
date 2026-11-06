# TPS1 Đặt hàng — hướng dẫn thử nghiệm

## Gửi khách dùng Android

1. Gửi file APK của bản thử nghiệm qua kênh tin cậy của TPS1. Khách tải file về điện thoại và mở file để cài. Nếu Android hỏi quyền cài ứng dụng từ nguồn này, bật quyền cho ứng dụng đang mở file, cài xong có thể tắt lại.
2. Mở **TPS1 Đặt hàng**. Chọn **Tiếng Việt / English / 简体中文** ở màn hình đăng nhập.
3. Nhập **SĐT hoặc tên đăng nhập** và mật khẩu. Mã khách hàng cũ vẫn dùng được. Nếu chưa có tài khoản, chọn **Đăng ký tài khoản**. Khách tự đăng ký có thể gửi đơn đầu tiên, nhưng TPS1 cần xác minh tài khoản trước khi xử lý.
4. Trước khi tìm kiếm, khách có thể lướt hàng thường mua và danh mục. Nhập từ khóa rồi nhấn Tìm để xem kết quả; chọn số lượng (Kg có thể dùng số lẻ) trước khi nhấn dấu cộng để thêm hàng. Kiểm tra địa chỉ, ngày giao sớm nhất, giờ chốt và số tiền tạm tính trước khi gửi. Chỉ coi là gửi thành công khi màn hình hiện **mã đơn hàng**.
5. Mặt hàng chưa có giá vẫn nằm trong đơn. Phần tạm tính chưa bao gồm các mặt hàng này; sale sẽ nhập giá hoặc bỏ dòng không có hàng trước khi xác nhận.
6. Trong **Tài khoản → Sổ địa chỉ**, khách có thể lưu nhiều điểm giao, chọn địa chỉ mặc định hoặc xóa địa chỉ cũ. **Đơn hàng của tôi** vẫn nằm ở tab riêng.

Giỏ hàng được lưu trên thiết bị. Khi mất mạng, mở lại app sau khi có mạng để gửi. Nếu quên mật khẩu, liên hệ TPS1 để được hỗ trợ.

## Khách dùng iPhone

Sau khi web app đặt hàng được triển khai ở địa chỉ chính thức của TPS1: mở bằng Safari, nhấn **Chia sẻ → Thêm vào Màn hình chính**, rồi mở biểu tượng TPS1. Bản đầu chưa có file cài iOS.

## Dành cho đội triển khai

- Bản `0.1.0-beta.10` là **debug APK** để cài thử nội bộ, ký bằng khóa debug của máy build. Icon Android dùng chính bộ icon web app `public/pwa-512x512.png` và `public/pwa-maskable-512x512.png`, đầy đủ biểu tượng và chữ “Thực Phẩm SỐ MỘT”. Các bản cập nhật gửi cùng nhóm thử phải dùng cùng khóa; trước khi phát hành rộng cần khóa release do TPS1 quản lý. Nền thực phẩm ở màn đăng nhập là ảnh minh họa tạo riêng cho giao diện, không phải ảnh nguồn hàng TPS1.
- Đăng nhập bằng SĐT hoặc tên đăng nhập; mã khách hàng cũ vẫn sử dụng được. Khách cũ đặt tên đăng nhập trong mục Tài khoản. Cần áp dụng migration `20261106_customer_username_login.sql` và cập nhật API trước khi thử bản APK này.
- Hồ sơ và ảnh đại diện cần chạy migration `20261106_customer_profile_requests.sql` và triển khai API mới trước khi dùng. Tên công ty/MST do khách sửa sẽ chờ admin duyệt trong hồ sơ khách hàng.
- API thay đổi ở web chính phải được triển khai trước khi thử đặt đơn chưa có giá và gắn sale. Không dùng đơn thật để thử trên backend production khi chưa có nhóm nghiệm thu.
- Bản dịch tên hàng là bản dịch tự động từ danh mục công khai ngày 05/11/2026 (5.295 sản phẩm, 5.187 tên khác nhau). Ứng dụng hiển thị cả tên tiếng Việt và SKU để đối chiếu, hỗ trợ tìm theo tên đã dịch. Đã sửa thủ công một số thuật ngữ dễ nhầm trong `scripts/apply-catalog-corrections.mjs`, nhưng **chưa có người thông thạo tiếng Trung rà toàn bộ danh mục**. Đội TPS1 cần rà các mặt hàng khách Trung Quốc thường mua trước khi gửi rộng. Khi cập nhật tệp dịch, chạy script sửa thuật ngữ rồi build lại. Hàng thêm sau ngày này sẽ hiện tên gốc cho đến khi cập nhật tệp dịch.
- Build lại: `npm ci`, `npm run android:sync`, rồi trong `android/` chạy `gradlew.bat assembleDebug` với JDK 21 và Android SDK đã cấu hình.
- Khi có địa chỉ web app iPhone chính thức, thay hướng dẫn iPhone bằng URL đó. Cần macOS/Xcode để đóng gói iOS sau giai đoạn thử.
