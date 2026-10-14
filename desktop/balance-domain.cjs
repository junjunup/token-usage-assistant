// Keep monetary values as decimal strings. No currency conversion or balance-delta billing.
function decimal(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 64 || !/^[-]?\d{1,30}(?:\.\d{1,18})?$/.test(value))
    throw new Error('Unsupported amount');
  const negative = value.startsWith('-'),
    [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const sign = negative && /[1-9]/.test(whole + fraction) ? '-' : '';
  return sign + whole.replace(/^0+(?=\d)/, '') + (fraction ? '.' + fraction : '');
}
function normalizeDeepSeek(raw) {
  if (
    !raw ||
    typeof raw.is_available !== 'boolean' ||
    !Array.isArray(raw.balance_infos) ||
    raw.balance_infos.length > 2
  )
    throw new Error('Unsupported balance response');
  const seen = new Set();
  const balances = raw.balance_infos.map((row) => {
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
function formatAmount(value) {
  if (value === null || value === undefined) return '—';
  let amount;
  try {
    amount = decimal(value);
  } catch {
    return '—';
  }
  const [whole, fraction = ''] = amount.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0');
}
module.exports = { normalizeDeepSeek, formatAmount };
