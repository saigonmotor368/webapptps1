import Link from "next/link";
import { ArrowRight, Boxes, BadgeCheck, ClipboardList, Leaf, MapPin, Truck } from "lucide-react";
import { categories } from "@/lib/content";
import { makeMetadata } from "@/lib/seo";
import { buildProductImageMap, readManagedProducts } from "@/lib/products";
import { ProductsGrid } from "./products-grid";

export const metadata = makeMetadata({
  title: "Sản phẩm",
  description:
    "Danh mục sản phẩm chính: rau củ quả, thịt cá hải sản, hàng đông lạnh, gia vị và thực phẩm chay cho bếp ăn B2B.",
  path: "/san-pham",
});

const localCoverageLinks = [
  { href: "/cung-cap-thuc-pham-dong-nai", title: "Cung cấp thực phẩm Đồng Nai" },
  { href: "/cung-cap-thuc-pham-bien-hoa", title: "Cung cấp thực phẩm Biên Hòa" },
  { href: "/cung-cap-thuc-pham-binh-duong", title: "Cung cấp thực phẩm Bình Dương" },
  { href: "/cung-cap-thuc-pham-nhon-trach", title: "Cung cấp thực phẩm Nhơn Trạch" },
  { href: "/cung-cap-thuc-pham-tp-hcm", title: "Cung cấp thực phẩm TP.HCM" },
  { href: "/cung-cap-thuc-pham-ba-ria-vung-tau", title: "Cung cấp thực phẩm Bà Rịa - Vũng Tàu" },
];

const guideLinks = [
  {
    href: "/kien-thuc/cach-lap-menu-bep-an-tap-the",
    title: "Cách lập menu cho bếp ăn tập thể",
    text: "Bài viết giúp chuyển từ menu sang danh mục mua hàng và định mức.",
  },
  {
    href: "/kien-thuc/checklist-gui-yeu-cau-bao-gia-nhanh",
    title: "Checklist gửi yêu cầu báo giá nhanh",
    text: "Chuẩn bị đúng thông tin trước khi gửi form để giảm vòng hỏi lại.",
  },
  {
    href: "/kien-thuc/cach-chon-thuc-pham-cho-bep-an-tap-the",
    title: "Cách chọn thực phẩm cho bếp ăn tập thể",
    text: "Bài giúp kiểm soát hao hụt và nhận hàng rõ hơn cho bếp quy mô lớn.",
  },
];

export const dynamic = "force-dynamic";

export default async function SanPhamPage() {
  const products = await readManagedProducts();

  return (
    <main className="sp-page">
      {/* ── Slim compact header ── */}
      <div className="sp-page__head container-shell">
        <div className="sp-page__head-left">
          <div className="eyebrow">Danh mục sản phẩm</div>
          <h1 className="sp-page__title">Danh mục thực phẩm cho bếp chuyên nghiệp</h1>
          <p className="sp-page__desc">
            Tra cứu nhóm hàng, quy cách và gửi nhu cầu để TPS1 tư vấn bảng giá phù hợp sản lượng của bếp.
          </p>
        </div>
        <div className="sp-page__badges">
          <span><ClipboardList size={14} /> Báo giá theo danh mục thực tế</span>
          <span><Truck size={14} /> Giao định kỳ toàn vùng Đông Nam Bộ</span>
          <span><BadgeCheck size={14} /> Đưa vào DS báo giá, không mua lẻ</span>
        </div>
      </div>

      {/* ── SKU Grid từ Supabase ── */}
      <ProductsGrid />

      <div className="container-shell" style={{ marginTop: '3rem', marginBottom: '3rem' }}>
        <section className="product-cta" style={{ borderRadius: '1rem' }}>
          <div>
            <Boxes size={26} />
            <h2>Cần báo giá theo danh mục riêng của bếp?</h2>
            <p>Gửi nhóm hàng, số lượng dự kiến, khu vực giao và tần suất nhận hàng để đội ngũ chuẩn bị RFQ phù hợp. Anh/chị cũng có thể tải file Excel/PDF ngay ở form báo giá.</p>
          </div>
          <Link href="/bao-gia" className="btn-primary btn-on-dark">
            Nhận báo giá theo nhu cầu <ArrowRight size={18} />
          </Link>
        </section>
      </div>
    </main>
  );
}
