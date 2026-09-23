"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Upload, FileText, Send, Lock, CheckCircle, Sparkles } from "lucide-react";
import { siteConfig } from "@/lib/site";
import { trackMetaLead } from "@/components/meta-pixel";

type FormState = "idle" | "submitting" | "success" | "error";

const texts = {
  vi: {
    sectors: [
      "Bếp ăn tập thể / Nhà máy",
      "Trường học / Đại học",
      "Bệnh viện / Phòng khám",
      "Nhà hàng / Khách sạn",
      "Suất ăn công nghiệp",
      "Siêu thị / Tạp hóa",
      "Khác",
    ],
    successAria: "Yêu cầu báo giá thành công",
    successTitle: "Đã nhận yêu cầu!",
    successDesc1: (
      <>
        Đội kinh doanh TPS1 sẽ phản hồi báo giá trong vòng <strong style={{ color: "#4ade80" }}>24 giờ</strong>.<br />
      </>
    ),
    successDesc2: (
      <>
        Trong giờ hành chính, gọi ngay <a href={`tel:${siteConfig.phone.replace(/\s/g, "")}`} style={{ color: "#4ade80", fontWeight: 700 }}>{siteConfig.phone}</a>.
      </>
    ),
    ariaLabel: "Yêu cầu báo giá",
    label: "Báo giá nhanh chóng",
    title: (
      <>
        Kết nối doanh nghiệp<br />
        nhận ngay báo giá.
      </>
    ),
    desc: (
      <>
        Gửi file Excel, PDF, ảnh chụp danh sách hàng cần mua. Đội kinh doanh TPS1 sẽ phân tích và gửi lại bảng giá chi tiết phù hợp nhất trong vòng <strong style={{ color: "#fff" }}>24 giờ</strong>.
      </>
    ),
    items: [
      "Danh mục nhóm hàng cần mua",
      "Số lượng / khối lượng ước tính",
      "Khu vực giao hàng",
      "Tần suất giao (ngày / tuần / tháng)",
    ],
    dragDropAria: "Kéo thả hoặc click để tải file",
    dragDropTitle: "Kéo thả file danh sách hàng vào đây",
    dragDropSub: "Hỗ trợ .xlsx, .pdf, .jpg, .png — tối đa 10MB",
    subject: "[TPS1] Yêu cầu báo giá B2B mới",
    companyLabel: "Tên công ty / tổ chức *",
    companyPlaceholder: "Công ty TNHH ABC...",
    contactLabel: "Họ tên người liên hệ *",
    contactPlaceholder: "Nguyễn Văn A",
    phoneLabel: "Số điện thoại *",
    phonePlaceholder: "0912 345 678",
    emailLabel: "Email",
    emailPlaceholder: "abc@company.vn",
    sectorLabel: "Loại hình doanh nghiệp",
    sectorPlaceholder: "— Chọn loại hình —",
    noteLabel: "Yêu cầu cụ thể",
    notePlaceholder: "Ví dụ: Cần 500kg rau củ/tuần, giao sáng thứ 2-4-6 tại KCN Biên Hòa...",
    submitSubmitting: "Đang gửi...",
    submitBtn: "Gửi yêu cầu báo giá ngay",
    errorMsg: `Có lỗi xảy ra. Vui lòng thử lại hoặc gọi ${siteConfig.phone}.`,
    promise: "Thông tin được bảo mật — không chia sẻ cho bên thứ ba",
  },
  en: {
    sectors: [
      "Canteens / Factories",
      "Schools / Universities",
      "Hospitals / Clinics",
      "Restaurants / Hotels",
      "Industrial Catering",
      "Supermarkets / Grocery",
      "Other",
    ],
    successAria: "Quote request successful",
    successTitle: "Request Received!",
    successDesc1: (
      <>
        TPS1 sales team will respond with a quote within <strong style={{ color: "#4ade80" }}>24 hours</strong>.<br />
      </>
    ),
    successDesc2: (
      <>
        During business hours, call <a href={`tel:${siteConfig.phone.replace(/\s/g, "")}`} style={{ color: "#4ade80", fontWeight: 700 }}>{siteConfig.phone}</a>.
      </>
    ),
    ariaLabel: "Request a quote",
    label: "Quick Quote",
    title: (
      <>
        Connect with us<br />
        for an instant quote.
      </>
    ),
    desc: (
      <>
        Send Excel, PDF files, or photos of your purchasing list. The TPS1 sales team will analyze and return the most suitable detailed pricing within <strong style={{ color: "#fff" }}>24 hours</strong>.
      </>
    ),
    items: [
      "List of required product categories",
      "Estimated quantity / volume",
      "Delivery area",
      "Delivery frequency (daily / weekly / monthly)",
    ],
    dragDropAria: "Drag and drop or click to upload file",
    dragDropTitle: "Drag & drop your product list file here",
    dragDropSub: "Supports .xlsx, .pdf, .jpg, .png — up to 10MB",
    subject: "[TPS1] New B2B Quote Request",
    companyLabel: "Company / Organization Name *",
    companyPlaceholder: "ABC Company...",
    contactLabel: "Contact Person Name *",
    contactPlaceholder: "John Doe",
    phoneLabel: "Phone Number *",
    phonePlaceholder: "0912 345 678",
    emailLabel: "Email",
    emailPlaceholder: "abc@company.com",
    sectorLabel: "Business Type",
    sectorPlaceholder: "— Select business type —",
    noteLabel: "Specific Requirements",
    notePlaceholder: "Example: Need 500kg of vegetables/week, delivered Mon-Wed-Fri mornings at Bien Hoa Industrial Park...",
    submitSubmitting: "Sending...",
    submitBtn: "Send quote request now",
    errorMsg: `An error occurred. Please try again or call ${siteConfig.phone}.`,
    promise: "Information is kept confidential — not shared with third parties",
  },
};


export function LeadCaptureSection({ locale = "vi" }: { locale?: "vi" | "en" }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [lastSummary, setLastSummary] = useState({ name: "Khách hàng B2B", company: "", phone: "", primaryNeed: "Yêu cầu báo giá B2B", secondaryNeed: "Yêu cầu từ trang chủ" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = texts[locale];

  const acceptedAttachmentTypes = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*";

  const acceptAttachment = (file: File | null) => {
    if (!file) {
      setFile(null);
      return;
    }
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(locale === "en" ? "File is too large. Max 10MB." : "File quá lớn. Tối đa 10MB.");
      return;
    }
    setFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) acceptAttachment(droppedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) acceptAttachment(selected);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormState("submitting");

    const form = e.currentTarget;
    const formData = new FormData(form);

    // Map fields to match QuoteLeadInput (quoteSchema)
    const company = formData.get("company")?.toString() || "";
    const contact = formData.get("contact")?.toString() || company || "Khách hàng B2B";
    const phone = formData.get("phone")?.toString() || "";
    const email = formData.get("email")?.toString() || "";
    const sector = formData.get("sector")?.toString() || "";
    const note = formData.get("note")?.toString() || "Yêu cầu báo giá từ trang chủ B2B";
    const params = new URLSearchParams(window.location.search);
    const hasBuyingList = formData.get("hasBuyingList")?.toString() || (file ? "Có" : "Chưa");
    setLastSummary({ name: contact, company, phone, primaryNeed: "Yêu cầu báo giá B2B", secondaryNeed: note });

    const payload = {
      inquiryType: "buyer",
      name: contact,
      phone: phone,
      company: company,
      email: email,
      message: note,
      facilityType: sector,
      interestedIn: "Nhiều nhóm hàng", // Default or you can add a field
      deliveryArea: formData.get("deliveryArea")?.toString() || "",
      purchaseScale: formData.get("purchaseScale")?.toString() || "",
      deliveryFrequency: formData.get("deliveryFrequency")?.toString() || "",
      contactRole: formData.get("contactRole")?.toString() || "",
      hasBuyingList,
      consent: formData.get("consent") === "yes",
      utmSource: params.get("utm_source") || "",
      utmMedium: params.get("utm_medium") || "",
      utmCampaign: params.get("utm_campaign") || "",
      utmContent: params.get("utm_content") || "",
      utmTerm: params.get("utm_term") || "",
      fbclid: params.get("fbclid") || "",
      pagePath: `${window.location.pathname}${window.location.search}`,
    };

    const submitData = new FormData();
    submitData.append("payload", JSON.stringify(payload));
    if (file) {
      submitData.append("attachment", file);
    }

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        body: submitData,
      });

      if (res.ok) {
        setFormState("success");
        trackMetaLead({ form_name: "homepage_rfq", facility_type: sector || "unknown", has_buying_list: hasBuyingList });
        if (typeof window.gtag === "function") {
          window.gtag("event", "conversion", {
            send_to: "AW-18295927026/QigLCM2X-8kcEPLhlpRE",
            value: 1,
            currency: "VND",
          });
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setFormState("error");
      }
    } catch {
      setFormState("error");
    }
  };

  if (formState === "success") {
    const summary = lastSummary;

    return (
      <section className="b2b-lead-section" aria-label={t.successAria}>
        <div className="container-shell">
          <div className="quote-thank-you" style={{ background: "transparent", padding: 0 }}>
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
                {locale === "en" ? "Inquiry Received Successfully!" : "Nhu Cầu Báo Giá Đã Được Tiếp Nhận!"}
              </h2>

              <div className="quote-thank-you__body">
                <p>
                  {locale === "en" ? (
                    <>
                      Thank you <strong>{summary.name}</strong> from <strong>{summary.company}</strong> for choosing <strong>Thực Phẩm Số Một (TPS1)</strong>. We have registered your request.
                    </>
                  ) : (
                    <>
                      Chân thành cảm ơn anh/chị <strong>{summary.name}</strong> đại diện cho <strong>{summary.company}</strong> đã tin tưởng lựa chọn <strong>Thực Phẩm Số Một (TPS1)</strong>. Chúng tôi đã ghi nhận thành công yêu cầu báo giá của anh/chị.
                    </>
                  )}
                </p>
              </div>

              <div className="quote-thank-you__promise">
                <div className="quote-thank-you__promise-icon">⚡</div>
                <div className="quote-thank-you__promise-text">
                  {locale === "en" ? (
                    <>
                      <strong>B2B Service Promise:</strong> Our dedicated consultant will contact you at <strong>{summary.phone || siteConfig.phone}</strong> within <strong>30 minutes</strong> (during business hours) to confirm the request; the complete quote will be provided within <strong>24 hours</strong> and onboarding support.
                    </>
                  ) : (
                    <>
                      <strong>Cam kết dịch vụ B2B:</strong> Chuyên viên tư vấn của Thực Phẩm Số Một sẽ chủ động liên hệ trực tiếp với anh/chị qua số điện thoại <strong>{summary.phone || siteConfig.phone}</strong> trong vòng <strong>30 phút</strong> (giờ hành chính) để xác nhận yêu cầu; báo giá hoàn chỉnh trong <strong>24 giờ</strong> và hỗ trợ quy trình lên đơn hàng.
                    </>
                  )}
                </div>
              </div>

              <div className="quote-thank-you__actions" style={{ marginTop: "32px", display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    setFormState("idle");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    setFile(null);
                  }}
                  className="btn-primary quote-thank-you__btn"
                >
                  {locale === "en" ? "Submit Another Request" : "Gửi yêu cầu báo giá mới"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="b2b-lead-section" id="rfq-form" aria-labelledby="lead-heading">
      <div className="container-shell">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "64px",
            alignItems: "start",
          }}
          className="lead-grid"
        >
          {/* Left: Copy */}
          <div>
            <div className="section-label" style={{ color: "#4ade80" }}>
              {t.label}
            </div>
            <h2 id="lead-heading" className="section-title-light">
              {t.title}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.62)", fontSize: "1rem", lineHeight: 1.75, marginBottom: "32px" }}>
              {t.desc}
            </p>

            {/* What we need */}
            <div style={{ display: "grid", gap: "14px" }}>
              {t.items.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: "10px", color: "rgba(255,255,255,0.70)" }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.30)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "block" }} />
                  </span>
                  <span style={{ fontSize: "0.92rem" }}>{item}</span>
                </div>
              ))}
            </div>

            {/* Dropzone */}
            <div
              className={`b2b-dropzone ${dragOver ? "is-drag-over" : ""}`}
              style={{ marginTop: "32px" }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label={t.dragDropAria}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            >
              <div className="b2b-dropzone__icon">
                {file ? <FileText size={28} /> : <Upload size={28} />}
              </div>
              {file ? (
                <p style={{ margin: 0, fontWeight: 700, color: "#4ade80" }}>
                  ✓ {file.name}
                </p>
              ) : (
                <>
                  <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: "0.95rem" }}>
                    {t.dragDropTitle}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "rgba(255,255,255,0.45)" }}>
                    {t.dragDropSub}
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Right: Form */}
          <div>
            <form className="b2b-lead-form" onSubmit={handleSubmit}>
              <input type="hidden" name="_subject" value={t.subject} />
              <input type="hidden" name="_captcha" value="false" />
              <input type="text" name="_honey" style={{ display: "none" }} />

              <div className="b2b-lead-form__field">
                <label htmlFor="lead-company">{t.companyLabel}</label>
                <input
                  id="lead-company"
                  name="company"
                  type="text"
                  placeholder={t.companyPlaceholder}
                  required
                />
              </div>

              <div className="b2b-lead-form__field">
                <label htmlFor="lead-contact">{t.contactLabel}</label>
                <input
                  id="lead-contact"
                  name="contact"
                  type="text"
                  placeholder={t.contactPlaceholder}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div className="b2b-lead-form__field">
                  <label htmlFor="lead-phone">{t.phoneLabel}</label>
                  <input
                    id="lead-phone"
                    name="phone"
                    type="tel"
                    placeholder={t.phonePlaceholder}
                    required
                  />
                </div>
                <div className="b2b-lead-form__field">
                  <label htmlFor="lead-email">{t.emailLabel}</label>
                  <input
                    id="lead-email"
                    name="email"
                    type="email"
                    placeholder={t.emailPlaceholder}
                  />
                </div>
              </div>

              <div className="b2b-lead-form__field">
                <label htmlFor="lead-sector">{t.sectorLabel}</label>
                <select id="lead-sector" name="sector">
                  <option value="">{t.sectorPlaceholder}</option>
                  {t.sectors.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>


              <div className="b2b-lead-form__field">
                <label htmlFor="lead-role">{locale === "en" ? "Your role *" : "Vai trò người liên hệ *"}</label>
                <select id="lead-role" name="contactRole" required defaultValue="">
                  <option value="" disabled>{locale === "en" ? "— Select role —" : "— Chọn vai trò —"}</option>
                  <option>{locale === "en" ? "Owner / Director" : "Chủ doanh nghiệp / Ban giám đốc"}</option>
                  <option>{locale === "en" ? "Purchasing / Procurement" : "Thu mua / Cung ứng"}</option>
                  <option>{locale === "en" ? "Kitchen / Canteen manager" : "Quản lý bếp / Canteen"}</option>
                  <option>{locale === "en" ? "HR / Administration" : "Hành chính / Nhân sự"}</option>
                  <option>{locale === "en" ? "Other" : "Khác"}</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div className="b2b-lead-form__field">
                  <label htmlFor="lead-scale">{locale === "en" ? "Daily scale *" : "Quy mô suất/ngày *"}</label>
                  <select id="lead-scale" name="purchaseScale" required defaultValue="">
                    <option value="" disabled>—</option><option>Dưới 200</option><option>200–499</option><option>500–999</option><option>1.000+</option>
                  </select>
                </div>
                <div className="b2b-lead-form__field">
                  <label htmlFor="lead-frequency">{locale === "en" ? "Purchase frequency *" : "Tần suất mua *"}</label>
                  <select id="lead-frequency" name="deliveryFrequency" required defaultValue="">
                    <option value="" disabled>—</option><option>Hằng ngày</option><option>2–3 lần/tuần</option><option>Hằng tuần</option><option>Chưa xác định</option>
                  </select>
                </div>
              </div>

              <div className="b2b-lead-form__field">
                <label htmlFor="lead-area">{locale === "en" ? "Delivery area *" : "Khu vực giao hàng *"}</label>
                <input id="lead-area" name="deliveryArea" required placeholder={locale === "en" ? "Industrial park / ward / city" : "KCN / phường / thành phố"} />
              </div>

              <div className="b2b-lead-form__field">
                <label htmlFor="lead-list">{locale === "en" ? "Buying list available? *" : "Đã có danh sách hàng cần báo giá? *"}</label>
                <select id="lead-list" name="hasBuyingList" required defaultValue={file ? "Có" : ""}>
                  <option value="" disabled>—</option><option value="Có">Có, sẽ gửi ngay</option><option value="Chưa">Chưa, cần TPS1 tư vấn</option>
                </select>
              </div>
              <div className="b2b-lead-form__field">
                <label htmlFor="lead-note">{t.noteLabel}</label>
                <textarea
                  id="lead-note"
                  name="note"
                  rows={4}
                  placeholder={t.notePlaceholder}
                  style={{ resize: "vertical" }}
                />
              </div>


              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "rgba(255,255,255,.72)", fontSize: ".78rem", lineHeight: 1.5 }}>
                <input type="checkbox" name="consent" value="yes" required style={{ width: 16, marginTop: 3 }} />
                <span>{locale === "en" ? "I agree that TPS1 may use this information to contact me about this quote request." : "Tôi đồng ý để TPS1 sử dụng thông tin này nhằm liên hệ tư vấn và báo giá theo yêu cầu; tôi có thể yêu cầu ngừng liên hệ hoặc xóa dữ liệu."} <Link href="/chinh-sach/bao-mat" style={{ color: "#4ade80" }}>{locale === "en" ? "Privacy policy" : "Chính sách bảo mật"}</Link>.</span>
              </label>
              <button
                type="submit"
                className="btn-lead-submit"
                disabled={formState === "submitting"}
              >
                {formState === "submitting" ? (
                  t.submitSubmitting
                ) : (
                  <>
                    <Send size={17} /> {t.submitBtn}
                  </>
                )}
              </button>

              {formState === "error" && (
                <p style={{ color: "#f87171", fontSize: "0.85rem", textAlign: "center", marginTop: 8 }}>
                  {t.errorMsg}
                </p>
              )}

              <div className="b2b-lead-promise">
                <Lock size={12} />
                {t.promise}
              </div>
            </form>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 768px) {
          .lead-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
      `}} />
    </section>
  );
}
