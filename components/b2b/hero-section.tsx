import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, FileCheck2, Phone, Truck } from "lucide-react";
import { siteConfig } from "@/lib/site";

const orderAppUrl = "https://dathang.thucphamsomot.vn/";

const copy = {
  vi: {
    eyebrow: "Nhà cung cấp thực phẩm B2B tại Đồng Nai",
    title: "Nguồn thực phẩm ổn định cho bếp ăn chuyên nghiệp.",
    description:
      "TPS1 cung ứng rau củ, thịt cá, thực phẩm đông lạnh và hàng khô cho nhà máy, trường học, bệnh viện, nhà hàng và đơn vị suất ăn công nghiệp.",
    primary: "Nhận báo giá cho bếp",
    secondary: "Xem danh mục sản phẩm",
    order: "Khách hiện hữu đặt hàng",
    phone: "Gọi tư vấn",
    highlights: [
      { icon: Truck, title: "Giao theo lịch bếp", text: "Tổ chức tuyến giao định kỳ theo khu vực và khung giờ nhận hàng." },
      { icon: FileCheck2, title: "Hồ sơ rõ ràng", text: "Hỗ trợ chứng từ, hóa đơn VAT và hồ sơ an toàn thực phẩm theo yêu cầu." },
      { icon: BadgeCheck, title: "Bảng giá theo nhu cầu", text: "Tư vấn danh mục và bảng giá theo sản lượng, quy cách và tần suất giao." },
    ],
    imageAlt: "Kho thực phẩm và năng lực cung ứng B2B của TPS1",
  },
  en: {
    eyebrow: "B2B food supplier in Dong Nai",
    title: "Reliable food supply for professional kitchens.",
    description:
      "TPS1 supplies produce, meat, seafood, frozen food and dry goods to factories, schools, hospitals, restaurants and industrial caterers.",
    primary: "Request a kitchen quote",
    secondary: "Browse products",
    order: "Existing customers order",
    phone: "Call us",
    highlights: [
      { icon: Truck, title: "Scheduled delivery", text: "Delivery routes aligned with each kitchen's receiving window." },
      { icon: FileCheck2, title: "Clear documentation", text: "VAT invoices and food-safety documents are available on request." },
      { icon: BadgeCheck, title: "Needs-based pricing", text: "Product lists and pricing tailored to volume, specifications and frequency." },
    ],
    imageAlt: "TPS1 warehouse and B2B food supply capability",
  },
} as const;

export function B2BHeroSection({ locale = "vi" }: { locale?: "vi" | "en" }) {
  const text = copy[locale];
  const catalogHref = locale === "en" ? "/en/products" : "/san-pham";

  return (
    <section className="b2b-hero" aria-labelledby="home-hero-title">
      <div className="b2b-hero__bg">
        <Image
          src="/images/hero-warehouse.jpg"
          alt={text.imageAlt}
          fill
          priority
          quality={80}
          className="object-cover object-center"
          sizes="100vw"
        />
      </div>
      <div className="b2b-hero__overlay" />

      <div className="b2b-hero__content">
        <div className="container-shell">
          <div style={{ maxWidth: 820 }}>
            <div className="b2b-hero__cert-badge" style={{ marginLeft: 0 }}>
              <BadgeCheck size={15} /> {text.eyebrow}
            </div>
            <h1 id="home-hero-title" className="b2b-hero__title" style={{ marginLeft: 0, textAlign: "left", maxWidth: 820 }}>
              {text.title}
            </h1>
            <p className="b2b-hero__sub" style={{ marginLeft: 0, textAlign: "left", maxWidth: 720 }}>
              {text.description}
            </p>

            <div className="b2b-hero__actions" style={{ justifyContent: "flex-start", marginTop: 28 }}>
              <Link href="#rfq-form" className="btn-hero-primary">
                {text.primary} <ArrowRight size={18} />
              </Link>
              <Link href={catalogHref} className="btn-hero-secondary">
                {text.secondary}
              </Link>
              <a href={orderAppUrl} className="btn-hero-secondary">
                {text.order}
              </a>
            </div>

            <a
              href={`tel:${siteConfig.phone.replace(/\s+/g, "")}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "white", marginTop: 20, fontWeight: 700 }}
            >
              <Phone size={17} /> {text.phone}: {siteConfig.phone}
            </a>

            <div className="b2b-hero__stats" style={{ justifyContent: "flex-start", marginTop: 34 }}>
              {text.highlights.map(({ icon: Icon, title, text: description }) => (
                <div key={title} className="b2b-hero__stat" style={{ maxWidth: 230 }}>
                  <span className="b2b-hero__stat-value" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "1rem" }}>
                    <Icon size={18} /> {title}
                  </span>
                  <span className="b2b-hero__stat-label" style={{ lineHeight: 1.5 }}>{description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
