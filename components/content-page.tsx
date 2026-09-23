import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpenText, CheckCircle2, ClipboardCheck } from "lucide-react";
import type { ContentSection, FaqItem } from "@/lib/content";
import { siteConfig } from "@/lib/site";
import { brandAssets } from "@/lib/brand";
import { FaqJsonLd } from "@/components/faq-json-ld";

type ContentPageProps = {
  title: string;
  description: string;
  bullets?: string[];
  sections?: ContentSection[];
  faqs?: FaqItem[];
  relatedLinks?: {
    href: string;
    label: string;
    description: string;
  }[];
  heroMedia?: {
    src: string;
    alt: string;
    caption: string;
    note?: string;
  };
  ctaHref?: string;
  ctaLabel?: string;
  quoteItem?: {
    slug: string;
    title: string;
    summary?: string;
  };
};

const sectionImages = [
  brandAssets.coverFood,
  brandAssets.kitchen,
  brandAssets.warehouseWide,
  brandAssets.team,
  brandAssets.vegetables,
  brandAssets.deliveryLoading,
  brandAssets.sourceFarm,
  brandAssets.quality,
  brandAssets.deliveryTruckReal,
];

export function ContentPage({
  title,
  description,
  bullets = [],
  sections = [],
  faqs = [],
  relatedLinks = [],
  heroMedia,
  ctaHref = "/bao-gia",
  ctaLabel = "Mở form báo giá",
  quoteItem,
}: ContentPageProps) {
  return (
    <article className="content-detail">
      <FaqJsonLd faqs={faqs} />
      <div className="content-detail__hero">
        <div className="content-detail__copy">
          <div className="pill">thucphamsomot.vn</div>
          <h1 className="content-detail__title">{title}</h1>
          <p className="content-detail__description">{description}</p>
          <div className="content-detail__actions">
            <Link href={ctaHref} className="btn-primary">
              {ctaLabel} <ArrowRight size={18} />
            </Link>
            <a href={`tel:${siteConfig.phone.replace(/\s+/g, "")}`} className="btn-secondary">
              Gọi {siteConfig.phone}
            </a>
          </div>
        </div>

        <aside className="content-detail__aside">
          {heroMedia ? (
            <div className="content-detail__media">
              <div className="content-detail__media-frame">
                <Image
                  src={heroMedia.src}
                  alt={heroMedia.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 34vw"
                  priority
                  className="content-detail__media-image"
                />
                <div className="content-detail__media-overlay" />
                <div className="content-detail__media-copy">
                  <span>{heroMedia.caption}</span>
                  <strong>{title}</strong>
                  {heroMedia.note ? <p>{heroMedia.note}</p> : null}
                </div>
              </div>
            </div>
          ) : null}
          <div className="content-detail__aside-card content-detail__aside-card--accent">
            <ClipboardCheck size={18} />
            <strong>Thông tin cần chuẩn bị</strong>
            <span>Nhóm hàng cần mua, số lượng dự kiến, địa điểm giao, tần suất giao và yêu cầu sơ chế hoặc đóng gói.</span>
          </div>
          <div className="content-detail__aside-card">
            <CheckCircle2 size={18} />
            <strong>Phù hợp khách mua định kỳ</strong>
            <span>Dành cho bếp ăn, trường học, bệnh viện, nhà hàng và đơn vị suất ăn cần nguồn hàng ổn định.</span>
          </div>
        </aside>
      </div>

      {bullets.length > 0 ? (
        <div className="content-detail__chips">
          {bullets.map((bullet) => (
            <div key={bullet} className="content-detail__chip">
              {bullet}
            </div>
          ))}
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div className="content-sections">
          {sections.map((section, index) => (
            <section key={section.heading} className="content-section">
              <div className="content-section__media">
                <Image
                  src={sectionImages[index % sectionImages.length]}
                  alt={section.heading}
                  fill
                  sizes="(max-width: 768px) 100vw, 34vw"
                  priority={index < 2}
                  className="content-section__image"
                />
              </div>
              <div className="content-section__body">
                <div className="content-section__eyebrow">Nội dung chính</div>
                <h2>{section.heading}</h2>
                <p>{section.body}</p>
                {section.items?.length ? (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {faqs.length > 0 ? (
        <section className="faq-list">
          <h2>Câu hỏi thường gặp</h2>
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </section>
      ) : null}

      {relatedLinks.length > 0 ? (
        <section className="content-section" style={{ marginTop: 24 }}>
          <div className="content-section__body">
            <div className="content-section__eyebrow">Bài liên quan</div>
            <h2>Xem tiếp nội dung phù hợp.</h2>
            <div className="home-local__grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginTop: 14 }}>
              {relatedLinks.map((item) => (
                <Link key={item.href} href={item.href} className="home-local__card" style={{ minHeight: 0 }}>
                  <h3>{item.label}</h3>
                  <p>{item.description}</p>
                  <span className="home-local__link">
                    Xem trang <ArrowRight size={16} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="content-detail__footer">
        <Link href={ctaHref} className="btn-primary">
          {ctaLabel} <BookOpenText size={18} />
        </Link>
        <a href={`tel:${siteConfig.phone.replace(/\s+/g, "")}`} className="btn-secondary">
          Gọi {siteConfig.phone}
        </a>
      </div>
    </article>
  );
}
