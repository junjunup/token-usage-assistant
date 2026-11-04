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
const positiveAmount = (/** @type {string} */ v) => !v.startsWith('-') && /[1-9]/.test(v);
/**
 * SiliconFlow GET /v1/user/info (T13.3, D20). The official reference lists the fields but not their meaning; from its
 * example (balance 0.88 + chargeBalance 88.00 = totalBalance 88.88) and how other tools read it, totalBalance is the
 * total, balance the granted part and chargeBalance the topped-up part. All three are decimal strings; totalBalance is
 * required. The currency comes from the site (CNY on siliconflow.cn, USD on siliconflow.com), never converted.
 * @param {any} raw upstream JSON
 * @param {'CNY'|'USD'} currency
 */
function normalizeSiliconFlow(raw, currency) {
  const data = raw?.data;
  if (!raw || raw.code !== 20000 || raw.status !== true || !data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Unsupported balance response');
  if (!['CNY', 'USD'].includes(currency)) throw new Error('Unsupported currency');
  const total = decimal(data.totalBalance),
    granted = decimal(data.balance),
    toppedUp = decimal(data.chargeBalance);
  if (total === null) throw new Error('Missing amounts');
  return {
    isAvailable: positiveAmount(total),
    balances: [{ currency, total, granted, toppedUp }],
    source: 'siliconflow-official-balance',
  };
}
/**
 * StepFun GET /v1/accounts (T13.3, D20; official reference). `balance` (a JSON number) is the available balance;
 * total_cash_balance / total_voucher_balance are lifetime totals (paid in, granted), not what is left, so they are
 * not shown as parts of the balance. China site only: the reference names no currency and the platform bills in CNY.
 * A postpaid account settles afterwards, so its balance does not decide whether it can call.
 * @param {any} raw upstream JSON
 */
function normalizeStepFun(raw) {
  if (!raw || raw.object !== 'account' || !['prepaid', 'postpaid'].includes(raw.type))
    throw new Error('Unsupported balance response');
  const total = numberAmount(raw.balance);
  if (total === null) throw new Error('Missing amounts');
  return {
    isAvailable: raw.type === 'postpaid' || positiveAmount(total),
    balances: [{ currency: 'CNY', total }],
    postpaid: raw.type === 'postpaid',
    source: 'stepfun-official-balance',
  };
}
/**
 * ZenMux GET /api/v1/management/payg/balance (T13.3, D20; official Management API): USD credits; total = top-up +
 * bonus (the platform allows small floating differences, so they are shown as returned, not recomputed).
 * @param {any} raw upstream JSON
 */
function normalizeZenMuxBalance(raw) {
  const data = raw?.data;
  if (
    !raw ||
    raw.success === false ||
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    data.currency !== 'usd'
  )
    throw new Error('Unsupported balance response');
  const total = numberAmount(data.total_credits),
    toppedUp = numberAmount(data.top_up_credits),
    granted = numberAmount(data.bonus_credits);
  if (total === null) throw new Error('Missing amounts');
  return {
    isAvailable: positiveAmount(total),
    balances: [{ currency: 'USD', total, granted, toppedUp }],
    source: 'zenmux-official-payg-balance',
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
module.exports = {
  normalizeDeepSeek,
  normalizeKimi,
  normalizeSiliconFlow,
  normalizeStepFun,
  normalizeZenMuxBalance,
  numberAmount,
  formatAmount,
  compactAmount,
};
