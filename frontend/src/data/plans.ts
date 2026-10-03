// Plan catalogue, shared by the public pricing page and the in-app
// subscription screen.
//
// The figures come from the live subscription page rather than being invented
// for marketing: Free is Rp 0, Pro is Rp 99.000, Premium is Rp 249.000, all per
// month. Keeping one source means the public page cannot quietly disagree with
// what a customer is actually charged.
//
// Feature text is deliberately absent here and comes from i18n instead, because
// the two locales word these differently.

export type PlanId = "basic" | "pro" | "premium";

export interface Plan {
  /** Numeric value for sorting and for the "most popular" pick. */
  amount: number;
  /** Machine key for i18n lookups. */
  id: PlanId;
  /** True for the tier we want a visitor to choose. Exactly one. */
  isPopular: boolean;
  /** Price formatted the way the product already shows it. */
  price: string;
}

export const PLANS: Plan[] = [
  { id: "basic", price: "Rp 0", amount: 0, isPopular: false },
  { id: "pro", price: "Rp 99.000", amount: 99_000, isPopular: false },
  { id: "premium", price: "Rp 249.000", amount: 249_000, isPopular: true },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`unknown plan: ${id}`);
  return plan;
}