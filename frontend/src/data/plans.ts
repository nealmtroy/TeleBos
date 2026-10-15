// Plan catalogue, shared by the public pricing page and the in-app
// subscription screen.
//
// The figures come from the authoritative subscription billing system:
// Free Trial is Rp 0 (5 jam), Starter (Basic) is Rp 5.000/bln,
// Pro is Rp 10.000/bln, Business (Premium) is Rp 20.000/bln.
// Yearly billing includes a 17% discount.

export type PlanId = "freetrial" | "basic" | "pro" | "premium";

export interface PlanFeature {
  text: string;
  tooltip?: string;
  included?: boolean;
}

export interface Plan {
  /** Numeric value for sorting and for the "most popular" pick (based on monthly price). */
  amount: number;
  /** Numeric value for yearly billing upfront. */
  yearlyAmount: number;
  /** Machine key for i18n lookups and backend contracts. */
  id: PlanId;
  /** Display title for UI presentation. */
  name: string;
  /** Short punchy tagline. */
  tagline: string;
  /** Concise description of plan target audience and value. */
  description: string;
  /** Maximum connected Telegram accounts allowed by backend limits. */
  accountLimit: number;
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

  /** Standard bullet points for features. */
  features: PlanFeature[];
  /** Explanatory footnote for billing and rules. */
  footnote: string;
}

export const PLANS: Plan[] = [
  { 
    id: "freetrial",
    name: "Free Trial",
    tagline: "Uji Coba Otomasi Dasar",
    description: "Coba fitur obrolan dan auto-reply selama 5 jam sejak pendaftaran. Pesan dilengkapi watermark.",
    accountLimit: 1,
    monthlyPrice: "Gratis", 
    price: "Gratis",
    yearlyPrice: "Gratis",
    yearlyEquivalentPrice: "Rp 0",
    yearlyDiscount: "0%",
    amount: 0,
    yearlyAmount: 0,
    isPopular: false,
    features: [
      { text: "1 akun Telegram aktif terhubung", tooltip: "Batas 1 sesi Telegram untuk uji coba awal" },
      { text: "Obrolan teks & manajemen chat langsung" },
      { text: "Sistem auto-reply responder aktif" },
      { text: "Masa aktif trial 5 jam", tooltip: "Otomatis kedaluwarsa setelah 5 jam sejak pendaftaran" },
      { text: "Pesan memiliki watermark resmi TeleBos" },
    ],
    footnote: "Gratis selama 5 jam dari saat Anda mendaftar. Tanpa butuh kartu kredit.",
  },
  { 
    id: "basic",
    name: "Starter",
    tagline: "Kelola 1 Akun Tanpa Gangguan",
    description: "Kelola akun Telegram personal atau bisnis kecil dengan auto-reply dan auto-join grup/channel.",
    accountLimit: 1,
    monthlyPrice: "Rp 5.000",  
    price: "Rp 5.000",
    yearlyPrice: "Rp 50.000",
    yearlyEquivalentPrice: "Rp 4.167",
    yearlyDiscount: "17%",
    amount: 5_000,
    yearlyAmount: 50_000,
    isPopular: false,
    features: [
      { text: "1 akun Telegram aktif terhubung", tooltip: "Kapasitas 1 akun Telegram untuk manajemen langsung" },
      { text: "Obrolan teks & manajemen chat langsung" },
      { text: "Auto-reply responder otomatis" },
      { text: "Auto-join grup & channel publik", tooltip: "Bergabung ke komunitas secara otomatis via index" },
      { text: "Dukungan proxy standar & enkripsi sesi AES-256" },
    ],
    footnote: "Cocok untuk mulai mengelola komunikasi Telegram secara efisien dan mandiri.",
  },
  { 
    id: "pro",
    name: "Pro",
    tagline: "Siaran Promosi Massal Tanpa Watermark",
    description: "Kirim pesan siaran massal terjadwal, kelola hingga 10 akun Telegram, dan perluas jangkauan komunitas.",
    accountLimit: 10,
    monthlyPrice: "Rp 10.000", 
    price: "Rp 10.000",
    yearlyPrice: "Rp 100.000",
    yearlyEquivalentPrice: "Rp 8.333",
    yearlyDiscount: "17%",
    amount: 10_000,
    yearlyAmount: 100_000,
    isPopular: false,
    features: [
      { text: "Kelola hingga 10 akun Telegram terhubung", tooltip: "Mendukung hingga 10 akun Telegram aktif sekaligus" },
      { text: "Siaran broadcast massal tanpa watermark", tooltip: "Kirim siaran pesan massal tanpa watermark telebos" },
      { text: "Jadwal broadcast otomatis & custom template" },
      { text: "Member Inviter & Auto-join grup" },
      { text: "Age Checker & Public Index grup/channel" },
      { text: "Sinkronisasi kontak & log riwayat aktivitas lengkap" },
    ],
    footnote: "Pilihan terbaik dan paling ekonomis untuk pemilik channel & pengelola grup aktif.",
  },
  { 
    id: "premium",
    name: "Business",
    tagline: "Kapasitas Skala Besar & Prioritas Tertinggi",
    description: "Solusi terlengkap: kapasitas hingga 100 akun, scraping member target, auto-invite, dan prioritas server tercepat.",
    accountLimit: 100,
    monthlyPrice: "Rp 20.000", 
    price: "Rp 20.000",
    yearlyPrice: "Rp 200.000",
    yearlyEquivalentPrice: "Rp 16.667",
    yearlyDiscount: "17%",
    amount: 20_000,
    yearlyAmount: 200_000,
    isPopular: true,
    features: [
      { text: "Koneksi hingga 100 akun Telegram aktif", tooltip: "Mendukung operasional armada multi-akun skala tinggi" },
      { text: "Siaran broadcast massal dengan antrean server prioritas #1" },
      { text: "Scrape member grup target & auto-invite langsung" },
      { text: "Banding otomatis status SpamBot Telegram", tooltip: "Sistem AI appeal otomatis ketika akun terkena limit" },
      { text: "Filter rotasi proxy & proteksi multi-sesi" },
      { text: "Akses prioritas fitur baru & bantuan teknis 24/7" },
    ],
    footnote: "Pilihan utama digital marketer, agensi, dan power seller akun Telegram.",
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`unknown plan: ${id}`);
  return plan;
}

export function getPlanPrice(id: PlanId, cycle: "monthly" | "yearly") {
  const plan = getPlan(id);
  if (id === "freetrial") {
    return {
      priceFormatted: plan.monthlyPrice,
      amount: 0,
      period: "",
      equivalent: null,
      discount: null,
    };
  }
  if (cycle === "yearly") {
    return {
      priceFormatted: plan.yearlyPrice,
      amount: plan.yearlyAmount,
      period: "/tahun",
      equivalent: plan.yearlyEquivalentPrice,
      discount: plan.yearlyDiscount,
    };
  }
  return {
    priceFormatted: plan.monthlyPrice,
    amount: plan.amount,
    period: "/bulan",
    equivalent: null,
    discount: null,
  };
}