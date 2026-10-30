// @ts-check
// Keep monetary values as decimal strings. No currency conversion or balance-delta billing.
/**
 * @param {any} value upstream amount (a decimal string, or missing)
 * @returns {string|null}
 */
function decimal(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 64 || !/^[-]?\d{1,30}(?:\.\d{1,18})?$/.test(value))
    throw new Error('Unsupported amount');
  const negative = value.startsWith('-'),
    [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const sign = negative && /[1-9]/.test(whole + fraction) ? '-' : '';
  return sign + whole.replace(/^0+(?=\d)/, '') + (fraction ? '.' + fraction : '');
}
/** @param {any} raw upstream /user/balance JSON */
function normalizeDeepSeek(raw) {
  if (
    !raw ||
    typeof raw.is_available !== 'boolean' ||
    !Array.isArray(raw.balance_infos) ||
    raw.balance_infos.length > 2
  )
    throw new Error('Unsupported balance response');
  const seen = new Set();
  const balances = raw.balance_infos.map((/** @type {any} */ row) => {
    if (!row || !['CNY', 'USD'].includes(row.currency) || seen.has(row.currency))
      throw new Error('Unsupported currency');
    seen.add(row.currency);
    const result = {
      currency: row.currency,
      total: decimal(row.total_balance),
      granted: decimal(row.granted_balance),
      toppedUp: decimal(row.topped_up_balance),
    };
    if ([result.total, result.granted, result.toppedUp].every((v) => v === null)) throw new Error('Missing amounts');
    return result;
  });
  return { isAvailable: raw.is_available, balances, source: 'deepseek-official-balance' };
}
/**
 * A JSON number amount as a decimal string (T10.1: Kimi returns numbers such as 49.58894). The shortest round-trip
 * form keeps the digits the server sent; exponent forms and non-finite values are rejected, not guessed.
 * @param {any} value
 * @returns {string|null}
 */
function numberAmount(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Unsupported amount');
  return decimal(String(value));
}
/**
 * Kimi open platform GET /v1/users/me/balance (T10.1, D16). The currency comes from the site: CNY on the China
 * site, USD on the international one (never converted). `available_balance` is required; voucher and cash are
 * optional (missing stays unknown). Negative cash means arrears; then the platform counts only the voucher.
 * @param {any} raw upstream JSON
 * @param {'CNY'|'USD'} currency
 */
function normalizeKimi(raw, currency) {
  const data = raw?.data;
  if (!raw || raw.code !== 0 || !data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Unsupported balance response');
  if (!['CNY', 'USD'].includes(currency)) throw new Error('Unsupported currency');
  const total = numberAmount(data.available_balance),
    voucher = numberAmount(data.voucher_balance),
    cash = numberAmount(data.cash_balance);
  if (total === null) throw new Error('Missing amounts');
  if (voucher !== null && voucher.startsWith('-')) throw new Error('Unsupported amount');
  const positive = (/** @type {string} */ v) => !v.startsWith('-') && /[1-9]/.test(v);
  return {
    // The platform rejects inference calls when the available balance is zero or below.
    isAvailable: positive(total),
    balances: [{ currency, total, voucher, cash, arrears: cash !== null && cash.startsWith('-') }],
    source: 'kimi-official-balance',
  };
}
/**
 * @param {any} value
 * @returns {string}
 */
function formatAmount(value) {
  if (value === null || value === undefined) return '—';
  let amount;
  try {
    amount = decimal(value);
  } catch {
    return '—';
  }
  // decimal() returns null only for a missing value, which was handled above.
  const [whole, fraction = ''] = /** @type {string} */ (amount).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0');
}
/**
 * Compact places (D17 ④: tiles, chips, the widget): two decimals, rounded half away from zero on the decimal digits
 * (no binary floating point). A non-zero amount that rounds to zero reads "<0.01", never "0.00"; details and storage
 * keep every digit (formatAmount).
 * @param {any} value a decimal string, or a finite number such as Command Code's monthly credits
 * @returns {string}
 */
function compactAmount(value) {
  if (value === null || value === undefined) return '—';
  let amount;
  try {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '—';
      // String() switches to exponent form below 1e-6; such an amount is below 0.01 either way.
      if (value !== 0 && Math.abs(value) < 1e-6) return (value < 0 ? '-' : '') + '<0.01';
      amount = decimal(String(value));
    } else amount = decimal(value);
  } catch {
    return '—';
  }
  const text = /** @type {string} */ (amount),
    negative = text.startsWith('-'),
    [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  let cents = BigInt(whole + fraction.slice(0, 2).padEnd(2, '0'));
  if (fraction.length > 2 && fraction[2] >= '5') cents += 1n;
  if (cents === 0n && /[1-9]/.test(fraction)) return (negative ? '-' : '') + '<0.01';
  const digits = cents.toString().padStart(3, '0');
  return (
    (negative && cents > 0n ? '-' : '') +
    digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    '.' +
    digits.slice(-2)
  );
}
module.exports = { normalizeDeepSeek, normalizeKimi, numberAmount, formatAmount, compactAmount };
