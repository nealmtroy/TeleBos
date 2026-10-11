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

export type PlanId = "freetrial" | "basic" | "pro" | "premium";

export interface Plan {
  /** Numeric value for sorting and for the "most popular" pick (based on monthly price). */
  amount: number;
  /** Machine key for i18n lookups. */
  id: PlanId;
  /** True for the tier we want a visitor to choose. Exactly one. */
  isPopular: boolean;
  
  /** Formatted monthly price. */
  monthlyPrice: string;
  /** Primary display price (alias for monthlyPrice). */
  price: string;
  /** Formatted yearly price (total billed upfront). */
  yearlyPrice: string;
  /** Formatted equivalent monthly price when billed yearly. */
  yearlyEquivalentPrice: string;
  /** Discount percentage text for yearly billing. */
  yearlyDiscount: string;
}

export const PLANS: Plan[] = [
  { 
    id: "freetrial", 
    monthlyPrice: "Gratis", 
    price: "Gratis",
    yearlyPrice: "Gratis",
    yearlyEquivalentPrice: "Rp 0",
    yearlyDiscount: "0%",
    amount: 0, 
    isPopular: false 
  },
  { 
    id: "basic", 
    monthlyPrice: "Rp 5.000",  
    price: "Rp 5.000",
    yearlyPrice: "Rp 50.000",
    yearlyEquivalentPrice: "Rp 4.167",
    yearlyDiscount: "17%",
    amount: 5_000, 
    isPopular: false 
  },
  { 
    id: "pro", 
    monthlyPrice: "Rp 10.000", 
    price: "Rp 10.000",
    yearlyPrice: "Rp 100.000",
    yearlyEquivalentPrice: "Rp 8.333",
    yearlyDiscount: "17%",
    amount: 10_000, 
    isPopular: false 
  },
  { 
    id: "premium", 
    monthlyPrice: "Rp 20.000", 
    price: "Rp 20.000",
    yearlyPrice: "Rp 200.000",
    yearlyEquivalentPrice: "Rp 16.667",
    yearlyDiscount: "17%",
    amount: 20_000, 
    isPopular: true 
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`unknown plan: ${id}`);
  return plan;
}