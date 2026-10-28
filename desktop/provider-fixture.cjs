// Synthetic fixtures based on official field contracts; never contact a real account.
const NOW = Date.UTC(2026, 8, 23, 10, 0, 0);
function fixtureBody(provider, now = NOW) {
  if (provider === 'opencode-go')
    return {
      usage: {
        rolling: { status: 'ok', percent: 28, resetsAt: new Date(now + 7200000).toISOString() },
        weekly: { status: 'ok', percent: 63, resetsAt: new Date(now + 172800000).toISOString() },
        monthly: { status: 'ok', percent: 42, resetsAt: new Date(now + 864000000).toISOString() },
      },
    };
  if (provider === 'deepseek')
    return {
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' },
      ],
    };
  // T10.1: the official sample response (both sites use the same shape; the currency comes from the site).
  if (provider === 'kimi')
    return {
      code: 0,
      data: { available_balance: 49.58894, voucher_balance: 46.58893, cash_balance: 3.00001 },
      scode: '0x0',
      status: true,
    };
  if (provider === 'glm')
    return {
      code: 200,
      success: true,
      data: {
        limits: [
          { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 32, nextResetTime: now + 7200000 },
          { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 58, nextResetTime: now + 200000000 },
          {
            type: 'TIME_LIMIT',
            unit: 5,
            number: 1,
            usage: 1000,
            currentValue: 84,
            percentage: 8.4,
            nextResetTime: now + 600000000,
          },
        ],
      },
    };
  if (provider === 'minimax')
    return {
      base_resp: { status_code: 0, status_msg: 'success' },
      model_remains: [
        {
          model_name: 'general',
          current_interval_total_count: 0,
          current_interval_usage_count: 0,
          current_interval_remaining_percent: 72,
          current_interval_status: 1,
          start_time: now - 7200000,
          end_time: now + 10800000,
          remains_time: 10800000,
          current_weekly_total_count: 0,
          current_weekly_usage_count: 0,
          current_weekly_remaining_percent: 64,
          current_weekly_status: 1,
          weekly_start_time: now - 86400000,
          weekly_end_time: now + 518400000,
          weekly_remains_time: 518400000,
        },
        {
          model_name: 'video',
          current_interval_total_count: 3,
          current_interval_usage_count: 2,
          current_interval_remaining_percent: 66.6666667,
          current_interval_status: 1,
          start_time: now - 3600000,
          end_time: now + 82800000,
          remains_time: 82800000,
          current_weekly_total_count: 0,
          current_weekly_usage_count: 0,
          current_weekly_status: 3,
        },
      ],
    };
  if (provider === 'volcengine')
    return {
      ResponseMetadata: { Action: 'GetAFPUsage', Version: '2024-01-01' },
      Result: {
        PlanType: 'Large',
        AFPFiveHour: { Quota: '50.0', Used: '12.5', SubscribeTime: now - 9000000, ResetTime: now + 9000000 },
        AFPDaily: { Quota: '100.0', Used: '22.5', SubscribeTime: now - 43200000, ResetTime: now + 43200000 },
        AFPWeekly: { Quota: '500.0', Used: '150.0', SubscribeTime: now - 302400000, ResetTime: now + 302400000 },
        AFPMonthly: { Quota: '2000.0', Used: '850.5', SubscribeTime: now - 1296000000, ResetTime: now + 1296000000 },
      },
    };
  throw new Error('Unknown fixture provider');
}
async function fixtureFetch(url) {
  const provider =
    url === 'https://opencode.ai/zen/go/v1/usage'
      ? 'opencode-go'
      : url === 'https://api.deepseek.com/user/balance'
        ? 'deepseek'
        : url.includes('api.moonshot.')
          ? 'kimi'
          : url.includes('bigmodel') || url.includes('api.z.ai')
            ? 'glm'
            : url.includes('minimax')
              ? 'minimax'
              : url.includes('volcengineapi')
                ? 'volcengine'
                : null;
  return new Response(JSON.stringify(fixtureBody(provider, Date.now())), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
module.exports = { fixtureBody, fixtureFetch, NOW };
