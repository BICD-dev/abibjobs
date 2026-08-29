// Centralised configuration for the job posting fee.
// The fee is a percentage of the job amount, charged to the poster at checkout.
// Defaults to 15% when JOB_POSTING_FEE_PERCENT is not set.

const FEE_PERCENT = parseFloat(process.env.JOB_POSTING_FEE_PERCENT || "15");

export function getJobPostingFee(jobAmount: number): number {
  if (!isFinite(jobAmount) || jobAmount <= 0) return 0;
  return Math.round((jobAmount * FEE_PERCENT) / 100 * 100) / 100;
}

export function getAdditionalFee(previousAmount: number, newAmount: number): number {
  const increase = newAmount - previousAmount;
  if (increase <= 0) return 0;
  return getJobPostingFee(increase);
}

export function getFeePercent(): number {
  return FEE_PERCENT;
}