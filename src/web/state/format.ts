function money(value: number, prefix: string) {
  const digits = value === 0 ? 2 : Math.max(2, Math.min(20, 1 - Math.floor(Math.log10(Math.abs(value)))));
  return `${prefix} ${value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
export const formatUsd = (value: number) => money(value, 'US$');
export const formatBrl = (value: number) => money(value, 'R$');
export const formatLatencia = (value: number) => `${value.toLocaleString('pt-BR', {maximumFractionDigits: 1})} ms`;
export const formatCusto = (cost: {usd: number; brl: number}) => `${formatUsd(cost.usd)} (${formatBrl(cost.brl)})`;

// Start the timer alongside the request; failures also preserve the visible classification step.
export async function withMinDelay<T>(promise: Promise<T>, ms = 2000, sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> {
  const [result] = await Promise.all([promise.then(value => ({ok: true as const, value}), error => ({ok: false as const, error})), sleep(ms)]);
  if (!result.ok) throw result.error;
  return result.value;
}
