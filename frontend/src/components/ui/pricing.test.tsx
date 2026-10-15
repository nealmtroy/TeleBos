import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

afterEach(cleanup);

import { useI18nStore } from "@/lib/i18n";
import {
  BorderTrail,
  PricingFrequencyToggle,
  PricingCard,
  PricingSection,
} from "./pricing";

describe("Pricing Components", () => {
  describe("BorderTrail", () => {
    it("renders without crashing with default props", () => {
      const { container } = render(<BorderTrail size={100} />);
      expect(container.firstChild).toBeDefined();
    });
  });

  describe("PricingFrequencyToggle", () => {
    it("renders frequencies and handles selection change in Indonesian", () => {
      useI18nStore.setState({ locale: "id" });
      const onFrequencyChange = vi.fn();
      render(
        <PricingFrequencyToggle
          selectedFrequency="monthly"
          onFrequencyChange={onFrequencyChange}
        />
      );

      expect(screen.getByText("Bulanan")).toBeDefined();
      expect(screen.getByText("Tahunan")).toBeDefined();
      expect(screen.getByText("Hemat 17%")).toBeDefined();

      const yearlyBtn = screen.getByRole("radio", { name: /tahunan/i });
      fireEvent.click(yearlyBtn);
      expect(onFrequencyChange).toHaveBeenCalledWith("yearly");
    });

    it("renders frequencies in English when locale is en", () => {
      useI18nStore.setState({ locale: "en" });
      render(
        <PricingFrequencyToggle
          selectedFrequency="monthly"
          onFrequencyChange={vi.fn()}
        />
      );

      expect(screen.getByText("Monthly")).toBeDefined();
      expect(screen.getByText("Yearly")).toBeDefined();
      expect(screen.getByText("Save 17%")).toBeDefined();
    });
  });

  describe("PricingCard", () => {
    it("renders plan details, price, features, and CTA link", () => {
      render(
        <PricingCard
          id="pro"
          name="Pro"
          tagline="Siaran Massal"
          description="Kirim pesan massal tanpa watermark"
          price="Rp 10.000"
          period="/bulan"
          features={[
            "10 Akun Telegram",
            { text: "Siaran massal", tooltip: "Kirim pesan siaran tanpa watermark" },
          ]}
          isPopular={true}
          popularBadgeText="Paling Populer"
          ctaText="Ambil Pro"
          ctaHref="/register"
          footnote="Tanpa kartu kredit"
        />
      );

      expect(screen.getByText("Pro")).toBeDefined();
      expect(screen.getByText("Siaran Massal")).toBeDefined();
      expect(screen.getByText("Rp 10.000")).toBeDefined();
      expect(screen.getByText("/bulan")).toBeDefined();
      expect(screen.getByText("10 Akun Telegram")).toBeDefined();
      expect(screen.getByText("Siaran massal")).toBeDefined();
      expect(screen.getByText("Paling Populer")).toBeDefined();
      expect(screen.getByRole("link", { name: /ambil pro/i })).toHaveAttribute(
        "href",
        "/register"
      );
      expect(screen.getByText("Tanpa kartu kredit")).toBeDefined();
    });

    it("triggers onCtaClick when button variant is used", () => {
      const handleClick = vi.fn();
      render(
        <PricingCard
          id="basic"
          name="Starter"
          description="Kelola 1 akun"
          price="Rp 5.000"
          features={["1 Akun Telegram"]}
          ctaText="Pilih Starter"
          onCtaClick={handleClick}
        />
      );

      const btn = screen.getByRole("button", { name: /pilih starter/i });
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("shows current plan state when isCurrentPlan is true", () => {
      render(
        <PricingCard
          id="freetrial"
          name="Free Trial"
          description="Uji coba gratis"
          price="Gratis"
          features={["1 Akun"]}
          isCurrentPlan={true}
          currentPlanText="Paket Anda Saat Ini"
          ctaText="Paket Aktif"
          ctaDisabled={true}
        />
      );

      expect(screen.getByText("Paket Anda Saat Ini")).toBeDefined();
      expect(screen.getByRole("button", { name: /paket aktif/i })).toBeDisabled();
    });
  });

  describe("PricingSection", () => {
    it("renders title, subtitle, frequency toggle, and children", () => {
      const onFrequencyChange = vi.fn();
      render(
        <PricingSection
          kicker="Paket Spesial"
          title="Pilih Paket Terbaik"
          subtitle="Tingkatkan skala akun Telegram Anda"
          frequency="monthly"
          onFrequencyChange={onFrequencyChange}
        >
          <div data-testid="test-card">Card Item</div>
        </PricingSection>
      );

      expect(screen.getByText("Paket Spesial")).toBeDefined();
      expect(screen.getByText("Pilih Paket Terbaik")).toBeDefined();
      expect(screen.getByText("Tingkatkan skala akun Telegram Anda")).toBeDefined();
      expect(screen.getByTestId("test-card")).toBeDefined();
    });
  });
});
