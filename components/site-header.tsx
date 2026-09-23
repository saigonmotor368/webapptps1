"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Menu, X, Users, ChevronDown, Check } from "lucide-react";
import { usePathname } from "next/navigation";
import { navItemsByLocale, siteConfig, type Locale } from "@/lib/site";
import { brandAssets } from "@/lib/brand";
import { TopBar } from "@/components/b2b/top-bar";

const orderAppUrl = "https://dathang.thucphamsomot.vn/";

function localeFromPath(pathname: string): Locale {
  return pathname.startsWith("/en") ? "en" : "vi";
}

function swapLocalePath(pathname: string, nextLocale: Locale) {
  const cleanPath = pathname === "/" ? "" : pathname;
  if (nextLocale === "en") {
    if (cleanPath.startsWith("/en")) return cleanPath || "/en";
    if (cleanPath === "/bao-gia") return "/en/bao-gia";
    if (cleanPath === "/gioi-thieu") return "/en/about";
    if (cleanPath === "/san-pham") return "/en/products";
    if (cleanPath === "/quy-trinh") return "/en/delivery";
    if (cleanPath === "/lien-he") return "/en/contact";
    if (cleanPath === "/nganh-hang" || cleanPath.startsWith("/nganh-hang/") || cleanPath.startsWith("/danh-muc")) return "/en/ingredients";
    if (cleanPath.startsWith("/kien-thuc")) return "/en/recipes";
    return "/en";
  }

  if (!cleanPath.startsWith("/en")) return cleanPath || "/";
  if (cleanPath === "/en/bao-gia") return "/bao-gia";
  if (cleanPath === "/en/about") return "/gioi-thieu";
  if (cleanPath === "/en/products") return "/san-pham";
  if (cleanPath === "/en/delivery") return "/quy-trinh";
  if (cleanPath === "/en/contact") return "/lien-he";
  if (cleanPath === "/en/ingredients") return "/nganh-hang/bep-an-tap-the";
  if (cleanPath === "/en/recipes") return "/kien-thuc";
  return "/";
}

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const locale = localeFromPath(pathname);
  const isEnglish = locale === "en";
  const navItems = navItemsByLocale[locale];
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <TopBar />

      <header key={pathname} className="site-header site-header--premium">
        <div className="container-shell site-header__inner">
          <Link href={isEnglish ? "/en" : "/"} className="site-brand" aria-label={siteConfig.englishName}>
            <span className="site-brand__mark">
              <Image src={brandAssets.logoTransparent} alt="TPS1" width={160} height={52} priority />
            </span>
            <span className="site-brand__copy">
              <span className="site-brand__name">{isEnglish ? siteConfig.englishName : siteConfig.name}</span>
              <span className="site-brand__tag">
                {isEnglish ? "B2B food supply · ISO 22000" : "Thực phẩm B2B · ISO 22000"}
              </span>
            </span>
          </Link>

          <button
            type="button"
            className="site-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <nav className="site-nav site-nav--minimal" aria-label={isEnglish ? "Main navigation" : "Điều hướng chính"}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="site-nav__link"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="site-header__actions">
            <div className="site-header__lang-dropdown" ref={langRef}>
              <button
                className="lang-dropdown-toggle"
                onClick={() => setLangOpen(!langOpen)}
                aria-label={isEnglish ? "Change language" : "Đổi ngôn ngữ"}
              >
                {isEnglish ? "EN" : "VI"}
                <ChevronDown size={14} className={`lang-dropdown-icon ${langOpen ? "is-open" : ""}`} />
              </button>

              {langOpen && (
                <div className="lang-dropdown-menu">
                  <Link
                    href={swapLocalePath(pathname, "vi")}
                    className={`lang-item ${!isEnglish ? "is-active" : ""}`}
                    onClick={() => setLangOpen(false)}
                  >
                    <Image src="/images/flag-vi.svg" alt="VI" width={20} height={15} />
                    <span>Tiếng Việt</span>
                    {!isEnglish && <Check size={14} className="lang-check" />}
                  </Link>
                  <Link
                    href={swapLocalePath(pathname, "en")}
                    className={`lang-item ${isEnglish ? "is-active" : ""}`}
                    onClick={() => setLangOpen(false)}
                  >
                    <Image src="/images/flag-en.svg" alt="EN" width={20} height={15} />
                    <span>English</span>
                    {isEnglish && <Check size={14} className="lang-check" />}
                  </Link>
                </div>
              )}
            </div>

            <div className="site-header__cta-group">
              <Link
                href={orderAppUrl}
                className="btn-header-outline"
                title={isEnglish ? "VIP Partner Portal" : "Cổng Đối Tác VIP"}
              >
                <Users size={14} />
                {isEnglish ? "VIP Portal" : "Cổng Đối Tác VIP"}
              </Link>
              <Link
                href={isEnglish ? "/en/bao-gia" : "/bao-gia"}
                className="btn-header-primary"
                id="header-rfq-btn"
              >
                {isEnglish ? "Request Quote" : "Yêu Cầu Báo Giá"}
              </Link>
            </div>
          </div>
        </div>

        <div id="site-mobile-nav" className={`site-mobile-nav${menuOpen ? " is-open" : ""}`}>
          <div className="container-shell site-mobile-nav__panel">
            <div className="site-mobile-nav__cta-group">
              <Link
                href={orderAppUrl}
                className="btn-header-outline"
                onClick={() => setMenuOpen(false)}
              >
                <Users size={14} />
                {isEnglish ? "VIP Portal" : "Cổng Đối Tác VIP"}
              </Link>
              <Link
                href={isEnglish ? "/en/bao-gia" : "/bao-gia"}
                className="btn-header-primary"
                onClick={() => setMenuOpen(false)}
              >
                {isEnglish ? "Request Quote" : "Yêu Cầu Báo Giá"}
              </Link>
            </div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="site-mobile-nav__link"
                onClick={() => setMenuOpen(false)}
              >
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </header>
    </>
  );
}
