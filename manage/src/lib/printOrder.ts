// Phiếu tạm / phiếu giao hàng — dùng chung cho PosCreatePage (in ngay sau khi
// tạo đơn), OrderDetailPage và OrdersPage (nút "In phiếu"). Khớp cấu trúc file
// Phiếu chi tiết đơn hàng: Mã hàng/Tên hàng/ĐVT/SL/Đơn giá/
// Giảm giá/Thành tiền + tổng, cộng thêm tên sale lên đơn (mục brief 2026-09-10).
export interface PrintableOrderItem {
  name: string;
  sku?: string | null;
  unit?: string | null;
  quantity: number;
  base_unit_price?: number | null;
  unit_price: number;
  line_total: number;
}

export interface PrintableOrder {
  order_code: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_company?: string | null;
  delivery_address?: string | null;
  delivery_name?: string | null;
  delivery_phone?: string | null;
  sales_rep_name?: string | null;
  created_at: string;
  note?: string | null;
  order_items: PrintableOrderItem[];
  subtotal?: number | null;
  discount_amount?: number | null;
  shipping_amount?: number | null;
  grand_total: number;
  cod_collect_amount?: number | null;
  assigned_driver?: string | null;
  package_weight_g?: number | null;
  package_dimensions?: string | null;
}

function money(v: number | string | null | undefined) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ';
}
function dt(v: string) {
  return v ? new Date(v).toLocaleString('vi-VN') : '—';
}

export function printOrderSlip(order: PrintableOrder) {
  const win = window.open('', '', 'width=850,height=700');
  if (!win) return;

  const totalQty = (order.order_items || []).reduce((s, i) => s + Number(i.quantity || 0), 0);

  const rows = (order.order_items || []).map((i) => {
    const base = Number(i.base_unit_price ?? i.unit_price);
    const discount = Math.max(0, Math.round((base - Number(i.unit_price)) * Number(i.quantity)));
    return `<tr>
      <td>${i.sku || ''}</td>
      <td>${i.name}</td>
      <td class="c">${i.unit || 'Kg'}</td>
      <td class="c">${i.quantity}</td>
      <td class="r">${money(i.unit_price)}</td>
      <td class="r">${discount ? money(discount) : '—'}</td>
      <td class="r"><b>${money(i.line_total)}</b></td>
    </tr>`;
  }).join('');

  win.document.write(`
    <html><head><title>Phiếu tạm ${order.order_code}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;font-size:13px;color:#14231c}
      h1{text-align:center;font-size:18px;margin:0 0 2px}
      .sub{text-align:center;color:#59665f;margin-bottom:16px;font-size:12px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:14px}
      .grid p{margin:2px 0}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px}
      th{background:#0f6f4b;color:#fff}
      .c{text-align:center}.r{text-align:right}
      tfoot td{border:none;padding:3px 8px}
      .total-row td{font-weight:bold;font-size:15px;border-top:2px solid #0f6f4b}
      .note{margin-top:10px;padding:8px;background:#f6f7f4;border-radius:6px;font-size:12px}
    </style></head><body>
    <h1>PHIẾU TẠM / PHIẾU GIAO HÀNG</h1>
    <p class="sub">TPS1 — Công ty TNHH Thực Phẩm Số Một · ${order.order_code} · ${dt(order.created_at)}</p>
    <div class="grid">
      <div>
        <p><b>Khách hàng:</b> ${order.customer_name}${order.customer_company ? ` (${order.customer_company})` : ''}</p>
        <p><b>Điện thoại:</b> ${order.customer_phone || '—'}</p>
        <p><b>Người bán:</b> ${order.sales_rep_name || '—'}</p>
      </div>
      <div>
        <p><b>Giao đến:</b> ${order.delivery_address || 'Nhận tại điểm'}</p>
        ${order.delivery_name ? `<p><b>Người nhận:</b> ${order.delivery_name} — ${order.delivery_phone || ''}</p>` : ''}
        ${order.assigned_driver ? `<p><b>Người giao:</b> ${order.assigned_driver}</p>` : ''}
        ${order.package_weight_g || order.package_dimensions ? `<p><b>Kiện hàng:</b> ${order.package_weight_g ? order.package_weight_g + 'g' : ''} ${order.package_dimensions || ''}</p>` : ''}
      </div>
    </div>
    <table>
      <thead><tr><th>Mã hàng</th><th>Tên hàng</th><th class="c">ĐVT</th><th class="c">SL</th><th class="r">Đơn giá</th><th class="r">Giảm giá</th><th class="r">Thành tiền</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="3"></td><td class="c">${totalQty}</td><td colspan="3" class="r">Tổng số lượng</td></tr>
        <tr><td colspan="6" class="r">Tạm tính</td><td class="r">${money(order.subtotal ?? order.grand_total)}</td></tr>
        ${order.discount_amount ? `<tr><td colspan="6" class="r">Giảm giá</td><td class="r">-${money(order.discount_amount)}</td></tr>` : ''}
        ${order.shipping_amount ? `<tr><td colspan="6" class="r">Phí giao hàng</td><td class="r">+${money(order.shipping_amount)}</td></tr>` : ''}
        <tr class="total-row"><td colspan="6" class="r">TỔNG CỘNG</td><td class="r">${money(order.grand_total)}</td></tr>
        ${order.cod_collect_amount ? `<tr><td colspan="6" class="r">Thu hộ COD</td><td class="r">${money(order.cod_collect_amount)}</td></tr>` : ''}
      </tfoot>
    </table>
    ${order.note ? `<div class="note"><b>Ghi chú:</b> ${order.note}</div>` : ''}
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>
  `);
  win.document.close();
}
