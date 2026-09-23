// Staging-only smoke test. Do not put a real token in this file or commit it.
// Usage: set API_BASE_URL=https://staging.example.com; set ORDER_SESSION_TOKEN=...; node scratch/test_resolve.js <product-uuid> [product-uuid...]
const baseUrl = process.env.API_BASE_URL;
const token = process.env.ORDER_SESSION_TOKEN;
const productIds = process.argv.slice(2);

if (!baseUrl || !token || productIds.length === 0) {
  console.error('Missing API_BASE_URL, ORDER_SESSION_TOKEN, or product UUID arguments');
  process.exit(2);
}

const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/customer/price-books/resolve`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ orderSessionToken: token, productIds }),
});

const body = await response.json().catch(() => ({}));
console.log(JSON.stringify({ status: response.status, body }, null, 2));
if (!response.ok) process.exit(1);

const rows = Array.isArray(body.data) ? body.data : [];
for (const row of rows) {
  if (!row.product_id || row.price == null || !row.price_source) {
    console.error('Invalid resolve row:', row);
    process.exit(1);
  }
}
