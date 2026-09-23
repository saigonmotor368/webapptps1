"use client";

import { useEffect, useState, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, Sparkles, MessageCircle } from "lucide-react";
import { quoteSchema, type QuoteLeadInput } from "@/lib/validation";
import { siteConfig, type Locale } from "@/lib/site";
import { useCart } from "@/lib/cart-context";
import { QuoteCartSummary } from "@/components/quote-cart-summary";

type InquiryType = "buyer" | "supplier";

type OptionItem = {
  value: string;
  label: Record<Locale, string>;
};

const buyerFacilityOptions: OptionItem[] = [
  { value: "canteen", label: { vi: "Bếp ăn tập thể", en: "Canteen" } },
  { value: "factory", label: { vi: "Nhà máy / KCN", en: "Factory / Industrial zone" } },
  { value: "school", label: { vi: "Trường học", en: "School" } },
  { value: "hospital", label: { vi: "Bệnh viện", en: "Hospital" } },
  { value: "hotel", label: { vi: "Nhà hàng / Khách sạn", en: "Restaurant / Hotel" } },
  { value: "distributor", label: { vi: "Đại lý / Nhà phân phối", en: "Dealer / Distributor" } },
  { value: "other", label: { vi: "Khác", en: "Other" } },
];

const buyerInterestOptions: OptionItem[] = [
  { value: "produce", label: { vi: "Rau củ quả", en: "Produce" } },
  { value: "meat-seafood", label: { vi: "Thịt cá hải sản", en: "Meat / Seafood" } },
  { value: "frozen", label: { vi: "Hàng đông lạnh", en: "Frozen goods" } },
  { value: "dry-grocery", label: { vi: "Gia vị / Khô / Gia dụng", en: "Seasoning / Dry goods / Household" } },
  { value: "vegetarian", label: { vi: "Thực phẩm chay", en: "Vegetarian food" } },
  { value: "all", label: { vi: "Tất cả nhóm hàng", en: "All categories" } },
];

const buyerScaleOptions: OptionItem[] = [
  { value: "lt50", label: { vi: "Dưới 50 suất/ngày", en: "Under 50 meals/day" } },
  { value: "50-100", label: { vi: "50 - 100 suất/ngày", en: "50 - 100 meals/day" } },
  { value: "100-300", label: { vi: "100 - 300 suất/ngày", en: "100 - 300 meals/day" } },
  { value: "300-500", label: { vi: "300 - 500 suất/ngày", en: "300 - 500 meals/day" } },
  { value: "gt500", label: { vi: "Trên 500 suất/ngày", en: "Over 500 meals/day" } },
];

const buyerFrequencyOptions: OptionItem[] = [
  { value: "daily", label: { vi: "Hằng ngày", en: "Daily" } },
  { value: "2-3-week", label: { vi: "2 - 3 lần/tuần", en: "2 - 3 times/week" } },
  { value: "weekly", label: { vi: "Theo tuần", en: "Weekly" } },
  { value: "monthly", label: { vi: "Theo tháng", en: "Monthly" } },
  { value: "as-needed", label: { vi: "Theo nhu cầu", en: "As needed" } },
];

const supplierNatureOptions: OptionItem[] = [
  { value: "processor", label: { vi: "Đơn vị chế biến", en: "Processor" } },
  { value: "trader", label: { vi: "Thương mại", en: "Trading" } },
  { value: "manufacturer", label: { vi: "Nhà sản xuất", en: "Manufacturer" } },
  { value: "distributor", label: { vi: "Nhà phân phối", en: "Distributor" } },
  { value: "other", label: { vi: "Loại khác", en: "Other" } },
];

const UI = {
  vi: {
    eyebrow: "Gửi nhu cầu mua hàng hoặc chào hàng",
    leadBuyer: "Chọn đúng vai trò rồi điền form mua hàng bên dưới.",
    leadSupplier: "Nhà cung cấp chỉ cần điền các thông tin chính. Phòng mua hàng sẽ liên hệ để trao đổi chi tiết sau.",
    roleBuyer: "Người mua",
    roleBuyerDesc: "Gửi nhu cầu đặt hàng, báo giá và lịch giao.",
    roleSupplier: "Nhà cung cấp",
    roleSupplierDesc: "Gửi thông tin chào hàng cho phòng mua hàng.",
    buyerSteps: ["1. Chọn vai trò", "2. Điền nhu cầu", "3. Gửi yêu cầu"],
    supplierSteps: ["1. Chọn vai trò", "2. Điền thông tin chính", "3. Gửi chào hàng"],
    buyerSubmit: "Gửi yêu cầu báo giá",
    supplierSubmit: "Gửi thông tin nhà cung cấp",
    sending: "Đang gửi...",
    successBadge: "Gửi thành công",
    buyerNote: "Thông tin sẽ được chuyển qua Phòng Kinh Doanh để liên hệ lại theo nhu cầu anh/chị đã chọn.",
    supplierNote: "Bộ phận mua hàng sẽ liên hệ lại để lấy các thông tin chi tiết còn thiếu sau khi nhận form.",
    buyerSuccessTitle: "Phòng Kinh Doanh đã ghi nhận nhu cầu mua hàng.",
    buyerSuccessCopy: "Chúng tôi sẽ liên hệ lại theo khu vực giao, nhóm hàng và quy mô nhu cầu anh/chị đã chọn.",
    supplierSuccessTitle: "Phòng Mua Hàng đã ghi nhận thông tin nhà cung cấp.",
    supplierSuccessCopy: "Chúng tôi sẽ xem xét các thông tin chính trước, sau đó liên hệ để lấy thêm chi tiết.",
    errorTitle: "Xin lỗi, chúng tôi chưa gửi được yêu cầu của anh/chị.",
    errorCopy: "Vui lòng liên hệ hotline để được hỗ trợ ngay: ",
    summaryIntro: "Lead vừa gửi:",
    companyProfile: "1. Hồ sơ doanh nghiệp",
    companyProfileHint: "Chỉ cần vài thông tin chính để bộ phận mua hàng biết anh/chị là ai.",
    mainContact: "2. Liên hệ chính",
    mainContactHint: "Đây là thông tin cần nhất để đội ngũ gọi lại nhanh.",
    supplyOverview: "3. Tóm tắt năng lực",
    supplyOverviewHint: "Phần còn lại sẽ trao đổi sau, anh/chị chỉ cần cho biết bức tranh chính.",
    placeholders: {
      goods: "Rau củ quả, thịt cá, hàng đông lạnh, gia vị, nguyên liệu chế biến...",
      certifications: "ISO, HACCP, VietGAP, công bố sản phẩm, hồ sơ năng lực...",
      supplierMessage: "Mô tả ngắn gọn nhóm hàng, lợi thế, MOQ, thời gian giao hoặc thông tin muốn chia sẻ thêm...",
      buyerMessage: "Mô tả nhóm hàng cần mua, số lượng, lịch giao, quy cách đóng gói, ngân sách hoặc điều kiện đặc biệt.",
    },
    common: {
      name: "Họ tên",
      phone: "Số điện thoại",
      company: "Công ty / Đơn vị",
      email: "Email",
      companyFallback: "Chưa ghi công ty",
      buyerRoleSummary: "Người mua",
      supplierRoleSummary: "Nhà cung cấp",
      deliveryArea: "Khu vực giao",
      supplyArea: "Khu vực cung ứng",
      notProvided: "chưa ghi",
    },
    buyer: {
      facilityType: "Loại hình đơn vị",
      interestedIn: "Nhóm hàng quan tâm",
      purchaseScale: "Quy mô nhu cầu",
      deliveryFrequency: "Tần suất giao",
      deliveryArea: "Khu vực giao",
      needBy: "Cần phản hồi trước",
      messageLabel: "Mô tả nhu cầu *",
    },
    supplier: {
      supplierType: "Loại nhà cung cấp",
      goodsServices: "Hàng hóa / dịch vụ cung cấp",
      contactPersonName: "Người liên hệ",
      contactTitle: "Chức danh",
      contactPhone: "Số điện thoại liên hệ",
      contactEmail: "Email liên hệ",
      supplyCapacity: "Năng lực cung ứng / MOQ",
      supplyArea: "Khu vực cung ứng",
      certifications: "Chứng nhận / điểm mạnh",
      messageLabel: "Ghi chú thêm *",
    },
  },
  en: {
    eyebrow: "Send a buying request or supplier pitch",
    leadBuyer: "Choose the buyer role and complete the buying request form below.",
    leadSupplier: "Suppliers only need to submit the key information. Our purchasing team will follow up for details.",
    roleBuyer: "Buyer",
    roleBuyerDesc: "Send purchasing needs, quote requests, and delivery timing.",
    roleSupplier: "Supplier",
    roleSupplierDesc: "Pitch your goods or services to our purchasing team.",
    buyerSteps: ["1. Choose role", "2. Fill request", "3. Send request"],
    supplierSteps: ["1. Choose role", "2. Fill key details", "3. Send pitch"],
    buyerSubmit: "Send quote request",
    supplierSubmit: "Send supplier info",
    sending: "Sending...",
    successBadge: "Sent successfully",
    buyerNote: "Your request will be routed to Sales for follow-up based on the information selected.",
    supplierNote: "Our purchasing team will contact you for any additional details after receiving this form.",
    buyerSuccessTitle: "Sales has received your buying request.",
    buyerSuccessCopy: "We will follow up based on your delivery area, product group, and demand volume.",
    supplierSuccessTitle: "Purchasing has received your supplier information.",
    supplierSuccessCopy: "We will review the key fields first, then contact you for the remaining details.",
    errorTitle: "Sorry, we could not send your request.",
    errorCopy: "Please call the hotline for immediate support: ",
    summaryIntro: "Latest submission:",
    companyProfile: "1. Company profile",
    companyProfileHint: "A few key details are enough for our purchasing team to identify your company.",
    mainContact: "2. Main contact",
    mainContactHint: "This is the most important contact information for a quick follow-up.",
    supplyOverview: "3. Supply overview",
    supplyOverviewHint: "The remaining details can be discussed later. Please share the main picture first.",
    placeholders: {
      goods: "Produce, meat, seafood, frozen goods, seasoning, processing ingredients...",
      certifications: "ISO, HACCP, VietGAP, product declarations, capability profile...",
      supplierMessage: "Briefly describe product groups, advantages, MOQ, delivery lead time, or other key information...",
      buyerMessage: "Share product groups, quantity, delivery schedule, packaging, budget, or special requirements.",
    },
    common: {
      name: "Full name",
      phone: "Phone number",
      company: "Company / Organization",
      email: "Email",
      companyFallback: "No company listed",
      buyerRoleSummary: "Buyer",
      supplierRoleSummary: "Supplier",
      deliveryArea: "Delivery area",
      supplyArea: "Supply area",
      notProvided: "not provided",
    },
    buyer: {
      facilityType: "Facility type",
      interestedIn: "Product group",
      purchaseScale: "Demand volume",
      deliveryFrequency: "Delivery frequency",
      deliveryArea: "Delivery area",
      needBy: "Need response by",
      messageLabel: "Buying needs *",
    },
    supplier: {
      supplierType: "Supplier type",
      goodsServices: "Goods / Services",
      contactPersonName: "Contact person",
      contactTitle: "Title",
      contactPhone: "Contact phone",
      contactEmail: "Contact email",
      supplyCapacity: "Supply capacity / MOQ",
      supplyArea: "Supply area",
      certifications: "Certifications / strengths",
      messageLabel: "Additional notes *",
    },
  },
} as const;

const LAST_SUCCESS_KEY = "tps1-quote-last-success-v5";
const LAST_NOTICE_KEY = "tps1-quote-last-notice-v5";

type QuoteSummary = {
  name: string;
  phone?: string;
  company: string;
  inquiryType: InquiryType;
  primaryNeed: string;
  secondaryNeed: string;
};

type QuoteNotice =
  | {
      kind: "success";
      summary: QuoteSummary;
    }
  | {
      kind: "error";
      message: string;
    };

type QuotePortalProps = {
  initialNotice?: QuoteNotice | null;
  locale?: Locale;
};

export function QuotePortal({ initialNotice = null, locale = "vi" }: QuotePortalProps) {
  const text = UI[locale];
  const getError = (message?: string) => translateValidationError(message, locale);
  const { items: cartItems, clear: clearCart } = useCart();

  const [submittedSummary, setSubmittedSummary] = useState<QuoteSummary | null>(
    initialNotice?.kind === "success" ? initialNotice.summary : null
  );
  const [submitted, setSubmitted] = useState(initialNotice?.kind === "success");
  const [submitError, setSubmitError] = useState<string | null>(
    initialNotice?.kind === "error" ? initialNotice.message : null
  );
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (initialNotice?.kind === "success") {
      saveSuccessState(initialNotice.summary);
      return;
    }

    if (initialNotice?.kind === "error") {
      saveNoticeState(initialNotice);
      return;
    }

    // Load from localStorage only on client-side mount to prevent SSR hydration mismatch
    const lastSuccess = readLastSuccessState();
    if (lastSuccess) {
      setSubmittedSummary(lastSuccess);
      setSubmitted(true);
      return;
    }

    const lastNotice = readLastNoticeState();
    if (lastNotice?.kind === "error") {
      setSubmitError(lastNotice.message);
    }
  }, [initialNotice]);

  const {
    register,
    trigger,
    getValues,
    reset,
    control,
    formState: { errors },
  } = useForm<QuoteLeadInput>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      inquiryType: "buyer",
      name: "",
      phone: "",
      company: "",
      email: "",
      message: "",
      facilityType: "",
      interestedIn: "",
      purchaseScale: "",
      deliveryFrequency: "",
      deliveryArea: "",
      needBy: "",
      pagePath: "",
      supplierType: "",
      supplierNameVi: "",
      supplierNameEn: "",
      goodsServices: "",
      registeredAddress: "",
      officeAddress: "",
      factoryAddress: "",
      incorporationPlace: "",
      officeFax: "",
      factoryPhone: "",
      factoryFax: "",
      website: "",
      taxCode: "",
      investmentCapital: "",
      yearsInBusiness: "",
      under6Months: "",
      employeeCount: "",
      topCustomers: "",
      contactPersonName: "",
      contactTitle: "",
      contactPhone: "",
      contactEmail: "",
      bankAccountHolder: "",
      bankAccountNo: "",
      bankNameBranch: "",
      currency: "",
      bankAddress: "",
      swiftCode: "",
      cityCountry: "",
      iban: "",
      correspondentBank: "",
      requiredDocuments: "",
      supplyCapacity: "",
      supplyArea: "",
      certifications: "",
      selectedItems: [],
    },
  });

  const inquiryType = (useWatch({ control, name: "inquiryType" }) ?? "buyer") as InquiryType;
  const isSupplier = inquiryType === "supplier";
  const steps = isSupplier ? text.supplierSteps : text.buyerSteps;
  const lead = isSupplier ? text.leadSupplier : text.leadBuyer;

  const submitLead = async () => {
    setSubmitError(null);
    setSubmitted(false);
    setIsSending(true);

    const isValid = await trigger();
    if (!isValid) {
      setIsSending(false);
      return;
    }

    const values = getValues();
    // Build cart items list for the message
    const cartLines = cartItems.length > 0
      ? "\n\n📦 Sản phẩm đã chọn:\n" + cartItems
          .map((it) => `• ${it.title}${it.summary ? ` (${it.summary})` : ""} — SL: ${it.quantity}`)
          .join("\n")
      : "";
    const payload = {
      ...values,
      pagePath: window.location.pathname,
      selectedItems: cartItems.map((it) => ({ slug: it.slug, title: it.title, quantity: it.quantity })),
      message: buildMessage(values, locale) + cartLines,
    };

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setSubmitError(text.errorTitle);
        saveNoticeState({ kind: "error", message: text.errorTitle });
        return;
      }

      const responseBody = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!responseBody?.ok) {
        setSubmitError(text.errorTitle);
        saveNoticeState({ kind: "error", message: text.errorTitle });
        return;
      }
    } catch {
      setSubmitError(text.errorTitle);
      saveNoticeState({ kind: "error", message: text.errorTitle });
      return;
    } finally {
      setIsSending(false);
    }

    const summary = buildSummary(values, locale);
    setSubmittedSummary(summary);
    saveSuccessState(summary);
    clearCart(); // Clear cart after successful submission
    
    // Trigger Google Ads Conversion Tracking
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", "conversion", {
          "send_to": "AW-18295927026/QigLCM2X-8kcEPLhlpRE",
          "value": 1.0,
          "currency": "VND"
      });
    }

    reset({
      inquiryType: values.inquiryType,
      name: "",
      phone: "",
      company: "",
      email: "",
      message: "",
      facilityType: "",
      interestedIn: "",
      purchaseScale: "",
      deliveryFrequency: "",
      deliveryArea: "",
      needBy: "",
      pagePath: "",
      supplierType: "",
      supplierNameVi: "",
      supplierNameEn: "",
      goodsServices: "",
      registeredAddress: "",
      officeAddress: "",
      factoryAddress: "",
      incorporationPlace: "",
      officeFax: "",
      factoryPhone: "",
      factoryFax: "",
      website: "",
      taxCode: "",
      investmentCapital: "",
      yearsInBusiness: "",
      under6Months: "",
      employeeCount: "",
      topCustomers: "",
      contactPersonName: "",
      contactTitle: "",
      contactPhone: "",
      contactEmail: "",
      bankAccountHolder: "",
      bankAccountNo: "",
      bankNameBranch: "",
      currency: "",
      bankAddress: "",
      swiftCode: "",
      cityCountry: "",
      iban: "",
      correspondentBank: "",
      requiredDocuments: "",
      supplyCapacity: "",
      supplyArea: "",
      certifications: "",
      selectedItems: [],
    });
    setSubmitted(true);
  };

  if (submitted && submittedSummary) {
    return (
      <div className="quote-thank-you">
        <div className="quote-thank-you__card">
          <div className="quote-thank-you__check-wrapper">
            <div className="quote-thank-you__checkmark-ring"></div>
            <div className="quote-thank-you__checkmark-circle">
              <svg className="quote-thank-you__checkmark-svg" viewBox="0 0 52 52">
                <circle className="quote-thank-you__checkmark-circle-path" cx="26" cy="26" r="25" fill="none" />
                <path className="quote-thank-you__checkmark-check-path" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
          </div>
          
          <div className="quote-thank-you__badge">
            <Sparkles size={16} />
            {locale === "en" ? "SUBMITTED SUCCESSFULLY" : "GỬI YÊU CẦU THÀNH CÔNG"}
          </div>

          <h2 className="quote-thank-you__title">
            {submittedSummary.inquiryType === "supplier"
              ? (locale === "en" ? "Thank You for Pitching!" : "Cảm Ơn Đối Tác Đã Chào Hàng!")
              : (locale === "en" ? "Inquiry Received Successfully!" : "Nhu Cầu Báo Giá Đã Được Tiếp Nhận!")}
          </h2>

          <div className="quote-thank-you__body">
            <p>
              {locale === "en" ? (
                <>
                  Thank you <strong>{submittedSummary.name}</strong> from <strong>{submittedSummary.company}</strong> for choosing <strong>Thực Phẩm Số Một (TPS1)</strong>. We have registered your request for <em>{submittedSummary.primaryNeed}</em>.
                </>
              ) : (
                <>
                  Chân thành cảm ơn anh/chị <strong>{submittedSummary.name}</strong> đại diện cho <strong>{submittedSummary.company}</strong> đã tin tưởng lựa chọn <strong>Thực Phẩm Số Một (TPS1)</strong>. Chúng tôi đã ghi nhận thành công yêu cầu cung cấp mặt hàng <em>{submittedSummary.primaryNeed}</em>.
                </>
              )}
            </p>
          </div>

          <div className="quote-thank-you__promise">
            <div className="quote-thank-you__promise-icon">⚡</div>
            <div className="quote-thank-you__promise-text">
              {locale === "en" ? (
                <>
                  <strong>B2B Service Promise:</strong> Our dedicated consultant will contact you at <strong>{submittedSummary.phone || siteConfig.phone}</strong> within <strong>15 minutes</strong> (during business hours) to provide a detailed quote and onboarding support.
                </>
              ) : (
                <>
                  <strong>Cam kết dịch vụ B2B:</strong> Chuyên viên tư vấn của Thực Phẩm Số Một sẽ chủ động liên hệ trực tiếp với anh/chị qua số điện thoại <strong>{submittedSummary.phone || siteConfig.phone}</strong> trong vòng <strong>15 phút</strong> (giờ hành chính) để báo giá chi tiết và hỗ trợ quy trình lên đơn hàng.
                </>
              )}
            </div>
          </div>

          <div className="quote-thank-you__summary">
            <span className="quote-thank-you__summary-label">
              {locale === "en" ? "Submission Details" : "Tóm tắt thông tin đã gửi"}
            </span>
            <div className="quote-thank-you__summary-details">
              <div>
                <strong>{locale === "en" ? "Type:" : "Vai trò:"}</strong> {roleLabel(submittedSummary.inquiryType, text)}
              </div>
              <div>
                <strong>{locale === "en" ? "Primary:" : "Yêu cầu chính:"}</strong> {submittedSummary.primaryNeed}
              </div>
              <div>
                <strong>{locale === "en" ? "Location/Detail:" : "Khu vực/Chi tiết:"}</strong> {submittedSummary.secondaryNeed}
              </div>
            </div>
          </div>

          <div className="quote-thank-you__actions">
            <a href="/" className="btn-secondary quote-thank-you__btn">
              {locale === "en" ? "Back to Homepage" : "Về Trang Chủ"}
            </a>
            <a 
              href={`https://zalo.me/${siteConfig.zaloOaId}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn-primary quote-thank-you__btn quote-thank-you__btn--zalo"
            >
              <MessageCircle size={18} />
              {locale === "en" ? "Zalo Chat (Urgent)" : "Chat Zalo (Khẩn Cấp)"}
            </a>
            <a href="/san-pham" className="btn-secondary quote-thank-you__btn">
              {locale === "en" ? "View Products" : "Xem Sản Phẩm"}
            </a>
          </div>

          <button 
            type="button" 
            onClick={() => {
              setSubmitted(false);
              setSubmittedSummary(null);
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(LAST_SUCCESS_KEY);
              }
            }} 
            className="quote-thank-you__new-request"
          >
            {locale === "en" ? "Submit Another Request" : "Gửi yêu cầu báo giá mới"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="quote-landing__form quote-landing__form--solo"
      method="post"
      action="/api/quote"
      onSubmit={(event) => {
        event.preventDefault();
        void submitLead();
      }}
    >
      <div className="quote-landing__form-head">
        <div className="portal-form__eyebrow">{text.eyebrow}</div>
        <p>{lead}</p>
        <div className="quote-landing__steps">
          {steps.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </div>

      <div className="quote-landing__role-grid">
        <label className={`quote-landing__role-card${!isSupplier ? " is-active" : ""}`}>
          <span className="quote-landing__role-card-head">
            <input type="radio" value="buyer" {...register("inquiryType")} />
            <strong>{text.roleBuyer}</strong>
          </span>
          <span>{text.roleBuyerDesc}</span>
        </label>
        <label className={`quote-landing__role-card${isSupplier ? " is-active" : ""}`}>
          <span className="quote-landing__role-card-head">
            <input type="radio" value="supplier" {...register("inquiryType")} />
            <strong>{text.roleSupplier}</strong>
          </span>
          <span>{text.roleSupplierDesc}</span>
        </label>
      </div>

      {isSupplier ? (
        <>
          <div className="quote-landing__section-card">
            <div className="quote-landing__section-card-head">
              <strong>{text.companyProfile}</strong>
              <span>{text.companyProfileHint}</span>
            </div>
            <div className="quote-landing__grid">
              <Field label={text.common.name} error={getError(errors.name?.message)} {...register("name")} />
              <Field label={text.common.company} error={getError(errors.company?.message)} {...register("company")} />
            </div>
            <div className="quote-landing__grid quote-landing__grid--supplier-profile">
              <SelectField label={text.supplier.supplierType} error={getError(errors.supplierType?.message)} {...register("supplierType")}>
                <option value="">-</option>
                {supplierNatureOptions.map((item) => (
                  <option key={item.value} value={item.label[locale]}>
                    {item.label[locale]}
                  </option>
                ))}
              </SelectField>
              <TextAreaField
                label={text.supplier.goodsServices}
                error={getError(errors.goodsServices?.message)}
                {...register("goodsServices")}
                rows={4}
                placeholder={text.placeholders.goods}
              />
            </div>
          </div>

          <div className="quote-landing__section-card">
            <div className="quote-landing__section-card-head">
              <strong>{text.mainContact}</strong>
              <span>{text.mainContactHint}</span>
            </div>
            <div className="quote-landing__grid">
              <Field label={text.supplier.contactPersonName} error={getError(errors.contactPersonName?.message)} {...register("contactPersonName")} />
              <Field label={text.supplier.contactTitle} error={getError(errors.contactTitle?.message)} {...register("contactTitle")} />
            </div>
            <div className="quote-landing__grid">
              <Field label={text.supplier.contactPhone} error={getError(errors.contactPhone?.message)} {...register("contactPhone")} />
              <Field label={text.supplier.contactEmail} error={getError(errors.contactEmail?.message)} {...register("contactEmail")} />
            </div>
          </div>

          <div className="quote-landing__section-card">
            <div className="quote-landing__section-card-head">
              <strong>{text.supplyOverview}</strong>
              <span>{text.supplyOverviewHint}</span>
            </div>
            <div className="quote-landing__grid">
              <Field label={text.supplier.supplyCapacity} error={getError(errors.supplyCapacity?.message)} {...register("supplyCapacity")} />
              <Field label={text.supplier.supplyArea} error={getError(errors.supplyArea?.message)} {...register("supplyArea")} />
            </div>
            <TextAreaField
              label={text.supplier.certifications}
              error={getError(errors.certifications?.message)}
              {...register("certifications")}
              rows={4}
              placeholder={text.placeholders.certifications}
            />
            <TextAreaField
              label={text.supplier.messageLabel}
              error={getError(errors.message?.message)}
              {...register("message")}
              rows={5}
              placeholder={text.placeholders.supplierMessage}
            />
          </div>

          <button type="submit" disabled={isSending} className="btn-primary quote-landing__submit">
            {isSending ? text.sending : text.supplierSubmit}
            <Send size={18} />
          </button>

          <p className="quote-landing__note">{text.supplierNote}</p>

          {submitted ? <SuccessBlock summary={submittedSummary} text={text} inquiryType={submittedSummary?.inquiryType} /> : null}
        </>
      ) : (
        <>
          {/* Cart summary — sản phẩm đã chọn từ trang /san-pham */}
          <QuoteCartSummary locale={locale} />

          <div className="quote-landing__grid">
            <Field label={text.common.name} error={getError(errors.name?.message)} {...register("name")} />
            <Field label={text.common.phone} error={getError(errors.phone?.message)} {...register("phone")} />
          </div>

          <div className="quote-landing__grid">
            <Field label={text.common.company} error={getError(errors.company?.message)} {...register("company")} />
            <Field label={text.common.email} error={getError(errors.email?.message)} {...register("email")} />
          </div>

          <div className="quote-landing__grid">
            <SelectField label={text.buyer.facilityType} error={getError(errors.facilityType?.message)} {...register("facilityType")}>
              <option value="">-</option>
              {buyerFacilityOptions.map((item) => (
                <option key={item.value} value={item.label[locale]}>
                  {item.label[locale]}
                </option>
              ))}
            </SelectField>
            <SelectField label={text.buyer.interestedIn} error={getError(errors.interestedIn?.message)} {...register("interestedIn")}>
              <option value="">-</option>
              {buyerInterestOptions.map((item) => (
                <option key={item.value} value={item.label[locale]}>
                  {item.label[locale]}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="quote-landing__grid">
            <SelectField label={text.buyer.purchaseScale} error={getError(errors.purchaseScale?.message)} {...register("purchaseScale")}>
              <option value="">-</option>
              {buyerScaleOptions.map((item) => (
                <option key={item.value} value={item.label[locale]}>
                  {item.label[locale]}
                </option>
              ))}
            </SelectField>
            <SelectField label={text.buyer.deliveryFrequency} error={getError(errors.deliveryFrequency?.message)} {...register("deliveryFrequency")}>
              <option value="">-</option>
              {buyerFrequencyOptions.map((item) => (
                <option key={item.value} value={item.label[locale]}>
                  {item.label[locale]}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="quote-landing__grid">
            <Field label={text.buyer.deliveryArea} error={getError(errors.deliveryArea?.message)} {...register("deliveryArea")} />
            <Field label={text.buyer.needBy} error={getError(errors.needBy?.message)} {...register("needBy")} />
          </div>

          <TextAreaField
            label={text.buyer.messageLabel}
            error={getError(errors.message?.message)}
            {...register("message")}
            rows={5}
            placeholder={text.placeholders.buyerMessage}
          />

          <button type="submit" disabled={isSending} className="btn-primary quote-landing__submit">
            {isSending ? text.sending : text.buyerSubmit}
            <Send size={18} />
          </button>

          <p className="quote-landing__note">{text.buyerNote}</p>

          {submitted ? <SuccessBlock summary={submittedSummary} text={text} inquiryType={submittedSummary?.inquiryType} /> : null}
        </>
      )}

      {submitError ? (
        <div className="portal-submit-status portal-submit-status--error" aria-live="polite">
          <strong>{text.errorTitle}</strong>
          <p>{submitError}</p>
          <a className="btn-secondary" href={`tel:${siteConfig.phone.replace(/\s+/g, "")}`}>
            {text.errorCopy}
            {siteConfig.phone}
          </a>
        </div>
      ) : null}
    </form>
  );
}

function SuccessBlock({
  summary,
  text,
  inquiryType,
}: {
  summary: QuoteSummary | null;
  text: (typeof UI)[Locale];
  inquiryType?: InquiryType;
}) {
  const isSupplier = inquiryType === "supplier";

  return (
    <div className="portal-submit-status portal-submit-status--success" aria-live="polite">
      <div className="portal-submit-status__badge">
        <Sparkles size={16} />
        {text.successBadge}
      </div>
      <strong>{isSupplier ? text.supplierSuccessTitle : text.buyerSuccessTitle}</strong>
      <p>{isSupplier ? text.supplierSuccessCopy : text.buyerSuccessCopy}</p>
      {summary ? (
        <div className="portal-submit-status__summary">
          <span>{text.summaryIntro}</span>
          <strong>
            {summary.name} · {summary.company} · {roleLabel(summary.inquiryType, text)} · {summary.primaryNeed}
          </strong>
          <p className="portal-submit-status__summary-note">{summary.secondaryNeed}</p>
        </div>
      ) : null}
    </div>
  );
}

function roleLabel(inquiryType: InquiryType, text: (typeof UI)[Locale]) {
  return inquiryType === "supplier" ? text.common.supplierRoleSummary : text.common.buyerRoleSummary;
}

const validationErrorTranslations: Record<string, string> = {
  "Vui lòng nhập họ tên": "Please enter your full name",
  "Vui lòng nhập số điện thoại": "Please enter your phone number",
  "Vui lòng nhập email hợp lệ": "Please enter a valid email",
  "Vui lòng mô tả nhu cầu": "Please describe your request",
  "Vui lòng chọn loại hình đơn vị": "Please choose a facility type",
  "Vui lòng chọn nhóm hàng quan tâm": "Please choose a product group",
  "Vui lòng chọn quy mô nhu cầu": "Please choose demand volume",
  "Vui lòng chọn tần suất giao": "Please choose delivery frequency",
  "Vui lòng nhập khu vực giao": "Please enter the delivery area",
  "Vui lòng chọn loại nhà cung cấp": "Please choose a supplier type",
  "Vui lòng cho biết anh/chị muốn chào hàng gì": "Please tell us what you want to offer",
  "Vui lòng nhập khu vực cung ứng": "Please enter the supply area",
  "Vui lòng nhập người liên hệ": "Please enter the contact person",
  "Vui lòng nhập số điện thoại liên hệ": "Please enter the contact phone number",
};

function translateValidationError(message: string | undefined, locale: Locale) {
  if (!message || locale === "vi") return message;
  return validationErrorTranslations[message] ?? message;
}

function buildSummary(values: QuoteLeadInput, locale: Locale): QuoteSummary {
  const text = UI[locale];

  return {
    name: values.name,
    phone: values.phone,
    company: values.company?.trim() || text.common.companyFallback,
    inquiryType: values.inquiryType,
    primaryNeed:
      values.inquiryType === "supplier"
        ? values.goodsServices || values.supplierType || (locale === "en" ? "Supplier information not specified" : "Thông tin nhà cung cấp chưa ghi rõ")
        : values.interestedIn || (locale === "en" ? "Product group not specified" : "Nhóm hàng chưa ghi rõ"),
    secondaryNeed:
      values.inquiryType === "supplier"
        ? values.supplyArea
          ? `${text.common.supplyArea}: ${values.supplyArea}`
          : `${text.common.supplyArea}: ${text.common.notProvided}`
        : values.deliveryArea
          ? `${text.common.deliveryArea}: ${values.deliveryArea}`
          : `${text.common.deliveryArea}: ${text.common.notProvided}`,
  };
}

function buildMessage(values: QuoteLeadInput, locale: Locale) {
  const labels =
    locale === "en"
      ? {
          roleSupplier: "Role: Supplier",
          roleBuyer: "Role: Buyer",
          supplierType: "Supplier type",
          goodsServices: "Goods / Services",
          contactPerson: "Contact person",
          contactPhone: "Contact phone",
          contactEmail: "Contact email",
          supplyCapacity: "Supply capacity",
          supplyArea: "Supply area",
          certifications: "Certifications",
          facilityType: "Facility type",
          productGroup: "Product group",
          demandVolume: "Demand volume",
          deliveryFrequency: "Delivery frequency",
          deliveryArea: "Delivery area",
          needBy: "Need response by",
        }
      : {
          roleSupplier: "Vai trò: Nhà cung cấp",
          roleBuyer: "Vai trò: Người mua",
          supplierType: "Loại nhà cung cấp",
          goodsServices: "Hàng hóa / dịch vụ cung cấp",
          contactPerson: "Người liên hệ",
          contactPhone: "Điện thoại liên hệ",
          contactEmail: "Email liên hệ",
          supplyCapacity: "Năng lực cung ứng",
          supplyArea: "Khu vực cung ứng",
          certifications: "Chứng nhận",
          facilityType: "Loại hình đơn vị",
          productGroup: "Nhóm hàng quan tâm",
          demandVolume: "Quy mô nhu cầu",
          deliveryFrequency: "Tần suất giao",
          deliveryArea: "Khu vực giao",
          needBy: "Cần phản hồi trước",
        };

  const lines = [values.message];

  if (values.inquiryType === "supplier") {
    lines.push(
      labels.roleSupplier,
      `${labels.supplierType}: ${values.supplierType}`,
      `${labels.goodsServices}: ${values.goodsServices}`,
      `${labels.contactPerson}: ${values.contactPersonName}`,
      `${labels.contactPhone}: ${values.contactPhone}`,
      `${labels.contactEmail}: ${values.contactEmail}`,
      `${labels.supplyCapacity}: ${values.supplyCapacity}`,
      `${labels.supplyArea}: ${values.supplyArea}`,
      `${labels.certifications}: ${values.certifications}`,
    );
  } else {
    lines.push(
      labels.roleBuyer,
      `${labels.facilityType}: ${values.facilityType}`,
      `${labels.productGroup}: ${values.interestedIn}`,
      `${labels.demandVolume}: ${values.purchaseScale}`,
      `${labels.deliveryFrequency}: ${values.deliveryFrequency}`,
      `${labels.deliveryArea}: ${values.deliveryArea}`,
      `${labels.needBy}: ${values.needBy}`,
    );
  }

  return lines.filter(Boolean).join("\n");
}

function saveSuccessState(summary: QuoteSummary) {
  // We no longer persist success state to localStorage to avoid showing the success screen
  // when the user returns to the page later.
}

function saveNoticeState(notice: QuoteNotice) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LAST_NOTICE_KEY, JSON.stringify(notice));
  } catch {
    // Ignore storage failures and keep the form usable.
  }
}

function readLastSuccessState(): QuoteSummary | null {
  // We no longer read success state from localStorage.
  // If there's an old one, let's just clear it to clean up the user's browser.
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LAST_SUCCESS_KEY);
    } catch {}
  }
  return null;
}

function readLastNoticeState(): QuoteNotice | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LAST_NOTICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuoteNotice;
    if (parsed?.kind === "error" && parsed.message) {
      return parsed;
    }
  } catch {
    // Ignore malformed local state and continue with a clean form.
  }

  return null;
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

function Field({ label, error, ...props }: FieldProps) {
  return (
    <div className="quote-landing__field">
      <label className="portal-form__label">{label}</label>
      <input {...props} className="lead-form__input" />
      {error ? <p className="lead-form__error">{error}</p> : null}
    </div>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
};

function SelectField({ label, error, children, ...props }: SelectFieldProps) {
  return (
    <div className="quote-landing__field">
      <label className="portal-form__label">{label}</label>
      <select {...props} className="lead-form__input">
        {children}
      </select>
      {error ? <p className="lead-form__error">{error}</p> : null}
    </div>
  );
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

function TextAreaField({ label, error, ...props }: TextAreaFieldProps) {
  return (
    <div className="quote-landing__field">
      <label className="portal-form__label">{label}</label>
      <textarea {...props} className="lead-form__textarea" />
      {error ? <p className="lead-form__error">{error}</p> : null}
    </div>
  );
}
