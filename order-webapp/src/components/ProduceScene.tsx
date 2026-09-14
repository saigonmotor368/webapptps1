// Minh hoạ trang trí cho màn đăng nhập/hero — vẽ tay bằng SVG (không dùng ảnh
// stock ngoài, tránh vấn đề bản quyền) theo tông thương hiệu TPS1: sọt rau củ
// tươi + lá xanh, gợi đúng ngành thực phẩm B2B thay vì trông như 1 dashboard
// chung chung.
export default function ProduceScene({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 480"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="crateWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c98a4b" />
          <stop offset="100%" stopColor="#9c6530" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#3fae7a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3fae7a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="240" cy="190" r="200" fill="url(#glow)" />

      {/* lá cách điệu bay lơ lửng */}
      <g opacity="0.85">
        <path d="M70 90c30-22 66-18 82 10 10 18 4 36-12 44-30 14-60-6-72-30-6-11-6-17 2-24Z" fill="#4c9a6c" />
        <path d="M380 60c26 4 44 28 40 54-3 20-20 30-38 24-24-8-34-34-28-56 3-12 10-24 26-22Z" fill="#2f7a52" />
        <path d="M410 220c22 10 30 34 18 52-11 17-32 18-46 4-16-16-14-40 2-52 8-6 17-7 26-4Z" fill="#4c9a6c" opacity="0.9" />
      </g>

      {/* sọt gỗ đựng rau củ */}
      <g transform="translate(80 250)">
        <rect x="0" y="40" width="200" height="110" rx="10" fill="url(#crateWood)" />
        <rect x="0" y="40" width="200" height="110" rx="10" stroke="#7a4d22" strokeOpacity="0.4" strokeWidth="3" />
        {[24, 60, 96, 132, 168].map((x) => (
          <line key={x} x1={x} y1="40" x2={x} y2="150" stroke="#7a4d22" strokeOpacity="0.35" strokeWidth="3" />
        ))}
        <line x1="0" y1="95" x2="200" y2="95" stroke="#7a4d22" strokeOpacity="0.35" strokeWidth="3" />

        {/* rau củ ló trên miệng sọt */}
        <circle cx="35" cy="30" r="26" fill="#e2482f" />
        <circle cx="35" cy="30" r="26" fill="#e2482f" />
        <path d="M30 8c4-10 14-14 20-10" stroke="#2f7a52" strokeWidth="5" strokeLinecap="round" />
        <circle cx="95" cy="22" r="30" fill="#e8a63c" />
        <path d="M90 -2c2-10 12-16 20-14" stroke="#2f7a52" strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="160" cy="26" rx="28" ry="24" fill="#5fae5a" />
        <path d="M150 4c-6-10 0-20 10-22" stroke="#2f7a52" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* tia nắng nhẹ phía sau */}
      <g opacity="0.18" stroke="#eef7ee" strokeWidth="6" strokeLinecap="round">
        <line x1="240" y1="20" x2="240" y2="60" />
        <line x1="150" y1="45" x2="175" y2="78" />
        <line x1="330" y1="45" x2="305" y2="78" />
      </g>
    </svg>
  );
}
