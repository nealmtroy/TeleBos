"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, Search, X, Check, Globe } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

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

let globalCachedCountries: TelegramCountry[] | null = null;

interface PhoneInputWithCountryProps {
  value: string;
  onChange: (fullNumber: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}

export function PhoneInputWithCountry({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  className,
  placeholder,
  id = "phone-input",
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
    <div ref={containerRef} className={cn("relative space-y-1", className)}>
      <div
        className={cn(
          "flex items-center rounded-xl border bg-white transition-all shadow-sm",
          disabled
            ? "bg-slate-50 border-slate-200 cursor-not-allowed opacity-75"
            : "border-slate-300 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100 hover:border-slate-400"
        )}
      >
        {/* Country Selector Trigger Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 bg-slate-50/70 border-r border-slate-200 rounded-l-xl text-slate-800 text-sm font-semibold transition hover:bg-slate-100 shrink-0",
            disabled && "cursor-not-allowed hover:bg-transparent"
          )}
          title={`Select Country (Currently ${selectedCountry.name} +${selectedCountry.code})`}
        >
          <span className="text-xl leading-none select-none">{selectedCountry.flag}</span>
          <span className="font-mono text-xs font-bold text-slate-700">+{selectedCountry.code}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", isOpen && "rotate-180")}
          />
        </button>

        {/* National Number Input Field */}
        <div className="flex-1 relative flex items-center">
          <input
            id={id}
            ref={nationalInputRef}
            type="tel"
            disabled={disabled}
            autoFocus={autoFocus}
            value={nationalNumber}
            onChange={(e) => handleNationalNumberChange(e.target.value)}
            placeholder={
              placeholder ||
              (selectedCountry.patterns && selectedCountry.patterns[0]
                ? selectedCountry.patterns[0].replace(/X/g, "8")
                : selectedCountry.code === "62"
                ? "812 3456 7890"
                : "123 456 7890")
            }
            className="w-full bg-transparent px-3.5 py-2.5 text-sm font-mono font-medium text-slate-900 placeholder:text-slate-400 outline-none disabled:cursor-not-allowed"
          />
          {nationalNumber && !disabled && (
            <button
              type="button"
              onClick={() => handleNationalNumberChange("")}
              className="mr-2.5 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              title="Clear input"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Helper text preview */}
      {nationalNumber && (
        <div className="flex items-center justify-between px-1 text-xs text-slate-500">
          <span className="truncate">
            Selected: <span className="font-medium text-slate-700">{selectedCountry.name}</span>
          </span>
          <span className="font-mono text-blue-600 font-semibold shrink-0">
            +{selectedCountry.code} {nationalNumber}
          </span>
        </div>
      )}

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Box Header */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/70">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country or code (e.g. 62, ID)..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Quick Popular Countries chips */}
            {!search && (
              <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                  Popular:
                </span>
                {popularCountries.map((c) => (
                  <button
                    key={c.iso2}
                    type="button"
                    onClick={() => handleSelectCountry(c)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition shrink-0",
                      selectedCountry.iso2 === c.iso2
                        ? "bg-blue-50 border-blue-200 text-blue-700 font-bold"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <span>{c.flag}</span>
                    <span className="font-mono text-[11px]">+{c.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Countries List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100/60 p-1">
            {filteredCountries.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <Globe className="h-7 w-7 mx-auto mb-1.5 opacity-40 text-slate-400" />
                <p className="font-semibold text-slate-600">No matching country found</p>
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
                        ? "bg-blue-50/80 text-blue-900 font-semibold"
                        : "hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl leading-none shrink-0 select-none">{c.flag}</span>
                      <span className="truncate block font-medium group-hover:text-slate-900">
                        {c.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase shrink-0">
                        ({c.iso2})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 group-hover:bg-slate-200 px-2 py-0.5 rounded transition">
                        +{c.code}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer note */}
          <div className="px-3.5 py-2 border-t border-slate-100 bg-slate-50/70 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Powered by Telegram MTProto API</span>
            <span className="font-mono font-semibold text-slate-500">{countries.length} countries</span>
          </div>
        </div>
      )}
    </div>
  );
}
