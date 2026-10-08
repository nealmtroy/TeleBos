"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, Search, X, Check, Globe } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { CountryFlag } from "@/components/layout/trade-surface";

export interface TelegramCountry {
  iso2: string;
  name: string;
  code: string;
  flag: string;
  prefixes?: string[];
  patterns?: string[];
}

const DEFAULT_POPULAR_ISOS = ["ID", "MY", "SG", "US", "GB", "RU", "AU", "DE", "IN", "PH", "VN", "TH"];

// Initial fallback countries while loading or if offline
const FALLBACK_COUNTRIES: TelegramCountry[] = [
  { iso2: "ID", name: "Indonesia", code: "62", flag: "🇮🇩", patterns: ["XXX XXXXXX"] },
  { iso2: "MY", name: "Malaysia", code: "60", flag: "🇲🇾" },
  { iso2: "SG", name: "Singapore", code: "65", flag: "🇸🇬", patterns: ["XXXX XXXX"] },
  { iso2: "US", name: "USA", code: "1", flag: "🇺🇸", patterns: ["XXX XXX XXXX"] },
  { iso2: "GB", name: "United Kingdom", code: "44", flag: "🇬🇧", patterns: ["XX XXXX XXXX"] },
  { iso2: "RU", name: "Russian Federation", code: "7", flag: "🇷🇺", patterns: ["XXX XXX XXXX"] },
  { iso2: "AU", name: "Australia", code: "61", flag: "🇦🇺" },
  { iso2: "DE", name: "Germany", code: "49", flag: "🇩🇪" },
  { iso2: "IN", name: "India", code: "91", flag: "🇮🇳" },
  { iso2: "PH", name: "Philippines", code: "63", flag: "🇵🇭" },
  { iso2: "VN", name: "Vietnam", code: "84", flag: "🇻🇳" },
  { iso2: "TH", name: "Thailand", code: "66", flag: "🇹🇭" },
];

export const COUNTRY_SAMPLE_FORMATS: Record<string, string> = {
  "62": "812 3456 7890",    // Indonesia
  "1": "201 555 0123",      // USA / Canada
  "44": "7911 123456",      // UK
  "60": "12 345 6789",      // Malaysia
  "65": "8123 4567",        // Singapore
  "91": "98765 43210",      // India
  "7": "912 345 6789",      // Russia / Kazakhstan
  "61": "412 345 678",      // Australia
  "49": "151 2345 6789",    // Germany
  "33": "6 12 34 56 78",    // France
  "81": "90 1234 5678",     // Japan
  "82": "10 1234 5678",     // South Korea
  "84": "91 234 5678",      // Vietnam
  "63": "912 345 6789",     // Philippines
  "66": "81 234 5678",      // Thailand
  "92": "301 2345678",      // Pakistan
  "90": "512 345 6789",     // Turkey
  "380": "50 123 4567",     // Ukraine
  "998": "90 123 4567",     // Uzbekistan
  "971": "50 123 4567",     // UAE
  "966": "50 123 4567",     // Saudi Arabia
  "234": "802 345 6789",    // Nigeria
  "55": "11 91234 5678",    // Brazil
  "48": "512 345 678",      // Poland
  "39": "312 345 6789",     // Italy
  "34": "612 345 678",      // Spain
  "31": "6 12345678",       // Netherlands
  "52": "55 1234 5678",     // Mexico
  "57": "300 123 4567",     // Colombia
  "54": "11 1234 5678",     // Argentina
  "27": "82 123 4567",      // South Africa
  "254": "712 345678",      // Kenya
  "212": "612 345678",      // Morocco
  "213": "550 12 34 56",    // Algeria
  "994": "50 123 4567",     // Azerbaijan
  "880": "1712 345678",     // Bangladesh
  "98": "912 345 6789",     // Iran
  "375": "29 123 4567",     // Belarus
  "351": "912 345 678",     // Portugal
};

export function getDynamicPlaceholder(country: TelegramCountry): string {
  if (COUNTRY_SAMPLE_FORMATS[country.code]) {
    return COUNTRY_SAMPLE_FORMATS[country.code];
  }
  const iso = country.iso2?.toLowerCase();
  if (iso && COUNTRY_SAMPLE_FORMATS[iso]) {
    return COUNTRY_SAMPLE_FORMATS[iso];
  }
  if (country.patterns && country.patterns.length > 0 && country.patterns[0]) {
    let digit = 1;
    return country.patterns[0].replace(/X/g, () => {
      const d = (digit++ % 9) + 1;
      return String(d);
    });
  }
  return "123 456 7890";
}

let globalCachedCountries: TelegramCountry[] | null = null;

interface PhoneInputWithCountryProps {
  value: string;
  onChange: (fullNumber: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
}

export function PhoneInputWithCountry({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  className,
  placeholder,
  id = "phone-input",
  name = "phone",
  ariaLabel = "Nomor Telepon",
}: PhoneInputWithCountryProps) {
  const [countries, setCountries] = useState<TelegramCountry[]>(
    globalCachedCountries || FALLBACK_COUNTRIES
  );
  const [selectedCountry, setSelectedCountry] = useState<TelegramCountry>(() => {
    return (
      (globalCachedCountries || FALLBACK_COUNTRIES).find((c) => c.iso2 === "ID") ||
      (globalCachedCountries || FALLBACK_COUNTRIES)[0]
    );
  });
  const [nationalNumber, setNationalNumber] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nationalInputRef = useRef<HTMLInputElement>(null);

  // Fetch country list from backend (cached)
  useEffect(() => {
    let mounted = true;
    if (!globalCachedCountries) {
      api
        .get<TelegramCountry[]>("/accounts/countries")
        .then((res) => {
          if (!mounted) return;
          if (Array.isArray(res.data) && res.data.length > 0) {
            globalCachedCountries = res.data;
            setCountries(res.data);
            // If current selected is default ID, sync from loaded data
            const foundId = res.data.find((c) => c.iso2 === "ID");
            if (foundId) {
              setSelectedCountry((curr) => (curr.iso2 === "ID" ? foundId : curr));
            }
          }
        })
        .catch(() => {
          // Keep fallback on error
        });
    }
    return () => {
      mounted = false;
    };
  }, []);

  // Parse external value on initial mount or change
  useEffect(() => {
    if (!value) {
      setNationalNumber("");
      return;
    }
    const clean = value.replace(/[^\d+]/g, "");
    if (clean.startsWith("+")) {
      const digitsOnly = clean.slice(1);
      // Find matching country by longest matching code
      const match = [...countries]
        .sort((a, b) => b.code.length - a.code.length)
        .find((c) => digitsOnly.startsWith(c.code));
      if (match) {
        setSelectedCountry(match);
        setNationalNumber(digitsOnly.slice(match.code.length));
        return;
      }
    }
  }, [value, countries]);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Filter countries by search term
  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    const cleanQ = q.replace("+", "");
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().includes(q) ||
        c.code.includes(cleanQ)
    );
  }, [countries, search]);

  // Popular countries subset
  const popularCountries = useMemo(() => {
    return DEFAULT_POPULAR_ISOS.map((iso) => countries.find((c) => c.iso2 === iso)).filter(
      Boolean
    ) as TelegramCountry[];
  }, [countries]);

  const handleSelectCountry = (country: TelegramCountry) => {
    setSelectedCountry(country);
    setIsOpen(false);
    setSearch("");
    // Recompute full value with new country code
    const full = nationalNumber ? `+${country.code}${nationalNumber}` : "";
    onChange(full);
    // Focus back to input
    setTimeout(() => nationalInputRef.current?.focus(), 50);
  };

  const handleNationalNumberChange = (raw: string) => {
    // If user pasted a full number with a plus sign e.g. +14155552671 or +62812...
    if (raw.trim().startsWith("+")) {
      const digits = raw.replace(/[^\d]/g, "");
      const match = [...countries]
        .sort((a, b) => b.code.length - a.code.length)
        .find((c) => digits.startsWith(c.code));
      if (match) {
        setSelectedCountry(match);
        const remainder = digits.slice(match.code.length);
        setNationalNumber(remainder);
        onChange(`+${match.code}${remainder}`);
        return;
      }
    }

    // Strip leading zero for Indonesian numbers e.g. 0812 -> 812
    let sanitized = raw.replace(/\D/g, "");
    if (selectedCountry.code === "62" && sanitized.startsWith("0")) {
      sanitized = sanitized.replace(/^0+/, "");
    }

    setNationalNumber(sanitized);
    const full = sanitized ? `+${selectedCountry.code}${sanitized}` : "";
    onChange(full);
  };

  return (
    <div ref={containerRef} className={cn("relative space-y-1", isOpen ? "z-50" : "z-10", className)}>
      <div
        className={cn(
          "flex items-center rounded-xl border bg-card transition-all shadow-xs",
          disabled
            ? "bg-muted/40 border-border/60 cursor-not-allowed opacity-75"
            : "border-border/80 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 hover:border-border"
        )}
      >
        {/* Country Selector Trigger Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            "flex items-center gap-2 px-3 py-2.5 bg-muted/40 border-r border-border/80 rounded-l-xl text-foreground text-sm font-semibold transition hover:bg-muted/70 shrink-0",
            disabled && "cursor-not-allowed hover:bg-transparent"
          )}
          title={`Select Country (Currently ${selectedCountry.name} +${selectedCountry.code})`}
        >
          <CountryFlag countryCode={selectedCountry.iso2 || selectedCountry.code} size="md" />
          <span className="font-mono text-xs font-bold text-foreground/90">+{selectedCountry.code}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")}
          />
        </button>

        {/* National Number Input Field */}
        <div className="flex-1 relative flex items-center">
          <input
            id={id}
            name={name}
            aria-label={ariaLabel}
            ref={nationalInputRef}
            type="tel"
            disabled={disabled}
            autoFocus={autoFocus}
            value={nationalNumber}
            onChange={(e) => handleNationalNumberChange(e.target.value)}
            placeholder={getDynamicPlaceholder(selectedCountry)}
            className="w-full bg-transparent px-3.5 py-2.5 text-sm font-mono font-medium text-foreground placeholder:text-muted-foreground/50 outline-none disabled:cursor-not-allowed"
          />
          {nationalNumber && !disabled && (
            <button
              type="button"
              onClick={() => handleNationalNumberChange("")}
              className="mr-2.5 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition"
              title="Clear input"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Helper text preview */}
      {nationalNumber && (
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span className="truncate">
            Selected: <span className="font-medium text-foreground">{selectedCountry.name}</span>
          </span>
          <span className="font-mono text-primary font-semibold shrink-0">
            +{selectedCountry.code} {nationalNumber}
          </span>
        </div>
      )}

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-80 sm:w-96 rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Box Header */}
          <div className="p-3 border-b border-border/80 bg-muted/30">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                id="country-search"
                name="countrySearch"
                aria-label="Search country or code"
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country or code (e.g. 62, ID)..."
                className="w-full rounded-xl border border-border/80 bg-background pl-9 pr-8 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Quick Popular Countries chips */}
            {!search && (
              <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 mr-1">
                  Popular:
                </span>
                {popularCountries.map((c) => (
                  <button
                    key={c.iso2}
                    type="button"
                    onClick={() => handleSelectCountry(c)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition shrink-0 select-none",
                      selectedCountry.iso2 === c.iso2
                        ? "bg-primary text-primary-foreground border-primary font-bold shadow-2xs"
                        : "bg-background border-border/80 text-foreground hover:bg-muted/80"
                    )}
                  >
                    <CountryFlag countryCode={c.iso2 || c.code} size="sm" />
                    <span className="font-mono text-[11px]">+{c.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Countries List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-border/40 p-1">
            {filteredCountries.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Globe className="h-7 w-7 mx-auto mb-1.5 opacity-40 text-muted-foreground" />
                <p className="font-semibold text-foreground">No matching country found</p>
                <p className="text-[11px] mt-0.5">Try searching with a country name or dialing code</p>
              </div>
            ) : (
              filteredCountries.map((c) => {
                const isSelected = selectedCountry.iso2 === c.iso2 && selectedCountry.code === c.code;
                return (
                  <button
                    key={`${c.iso2}-${c.code}`}
                    type="button"
                    onClick={() => handleSelectCountry(c)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition text-xs group",
                      isSelected
                        ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                        : "hover:bg-muted/60 text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CountryFlag countryCode={c.iso2 || c.code} size="md" />
                      <span className="truncate block font-medium group-hover:text-foreground">
                        {c.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase shrink-0">
                        ({c.iso2})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-mono text-xs font-semibold text-muted-foreground bg-muted group-hover:bg-muted/80 px-2 py-0.5 rounded transition">
                        +{c.code}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer note */}
          <div className="px-3.5 py-2 border-t border-border/80 bg-muted/30 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Powered by Telegram MTProto API</span>
            <span className="font-mono font-semibold text-foreground/80">{countries.length} countries</span>
          </div>
        </div>
      )}
    </div>
  );
}
