import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/content-page";
import { PageShell } from "@/components/page-shell";
import { findBySlug } from "@/lib/content";
import { makeMetadata } from "@/lib/seo";
import { readManagedProducts, toContentProduct } from "@/lib/products";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const products = (await readManagedProducts()).map(toContentProduct);
  const item = findBySlug(products, slug);
  if (!item) return makeMetadata({ title: "San pham", path: `/san-pham/${slug}` });
  return makeMetadata({
    title: item.title,
    description: item.summary,
    path: `/san-pham/${item.slug}`,
  });
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const products = (await readManagedProducts()).map(toContentProduct);
  const item = findBySlug(products, slug);
  if (!item) return notFound();
  const description = item.summary ?? item.description ?? item.title;

  return (
    <PageShell eyebrow="San pham" title={item.title} description={description}>
      <ContentPage
        title={item.title}
        description={description}
        bullets={item.features}
        sections={item.sections}
        faqs={item.faqs}
        ctaHref="https://dathang.thucphamsomot.vn/"
        ctaLabel="Đặt hàng trên Cổng Đối Tác"
      />
    </PageShell>
  );
}
