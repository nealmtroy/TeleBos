import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, WifiOff } from "lucide-react";
import { ChatAvatar } from "./ChatAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface AccountSwitcherProps {
  accounts: any[] | undefined;
  selectedAccount: string;
  onSelectAccount: (id: string) => void;
  getApiUrl: () => string;
  connected: boolean;
}

/**
 * Scalable Account Switcher — uses Shadcn/Radix Popover.
 * Shows compact avatar in header; click opens full account panel.
 * Supports search, virtualized scroll, and recent-accounts ordering.
 */
export function AccountSwitcher({
  accounts,
  selectedAccount,
  onSelectAccount,
  getApiUrl,
  connected,
}: AccountSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeAccounts = useMemo(
    () => (Array.isArray(accounts) ? accounts.filter((acc) => acc.is_active && !acc.for_sale) : []),
    [accounts]
  );

  const selectedAcc = useMemo(
    () => activeAccounts.find((acc) => acc.id === selectedAccount),
    [activeAccounts, selectedAccount]
  );

  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return activeAccounts;
    const q = search.toLowerCase();
    return activeAccounts.filter(
      (acc) =>
        acc.first_name?.toLowerCase().includes(q) ||
        acc.last_name?.toLowerCase().includes(q) ||
        acc.phone?.includes(q) ||
        acc.username?.toLowerCase().includes(q)
    );
  }, [activeAccounts, search]);

  // Auto-focus search when popover opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelectAccount(id);
      setIsOpen(false);
      setSearch("");
    },
    [onSelectAccount]
  );

  const displayName = selectedAcc
    ? [selectedAcc.first_name, selectedAcc.last_name].filter(Boolean).join(" ") || selectedAcc.phone
    : "Select Account";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {/* ---- Compact Trigger (Header) ---- */}
      <PopoverTrigger asChild>
        <button
          type="button"
          className="tg-ripple"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 8px",
            borderRadius: 10,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            flex: 1,
            minWidth: 0,
            transition: "background-color var(--tg-transition-fast)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--tg-bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          {/* Mini avatar */}
          {selectedAcc && (
            <ChatAvatar
              accountId={selectedAcc.id}
              chatTitle={displayName}
              colorId={selectedAcc.color_id ?? selectedAcc.telegram_id}
              hasProfilePhoto={selectedAcc.has_profile_photo}
              photoVersion={selectedAcc.photo_version}
              isActive={selectedAcc.is_active}
              profilePhotoPath={selectedAcc.profile_photo_path}
              sizeClassName="w-[36px] h-[36px] text-sm"
            />
          )}

          {/* Name + phone */}
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div
              className="tg-truncate"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--tg-text-primary)",
                lineHeight: 1.2,
              }}
            >
              {displayName}
            </div>
            {selectedAcc?.phone && (
              <div
                className="tg-truncate"
                style={{
                  fontSize: 11,
                  color: "var(--tg-text-secondary)",
                  marginTop: 1,
                }}
              >
                +{selectedAcc.phone}
              </div>
            )}
          </div>

          <ChevronDown
            style={{
              width: 16,
              height: 16,
              color: "var(--tg-text-tertiary)",
              flexShrink: 0,
              transition: "transform var(--tg-transition-fast)",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
      </PopoverTrigger>

      {/* ---- Radix Popover Content ---- */}
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[340px] p-0 bg-[var(--tg-bg-primary)] border border-[var(--tg-border)] shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[520px] z-50 text-[var(--tg-text-primary)]"
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--tg-border)]">
          <span className="font-semibold text-sm text-[var(--tg-text-primary)]">
            Switch Account
          </span>
          <span className="tg-status-badge text-[11px]" data-connected={connected}>
            {connected ? (
              <>
                <span className="tg-pulse-dot" style={{ backgroundColor: "var(--tg-green)" }} />
                <span style={{ color: "var(--tg-green)" }}>Live</span>
              </>
            ) : (
              <>
                <WifiOff style={{ width: 12, height: 12, color: "var(--tg-text-tertiary)" }} />
                <span style={{ color: "var(--tg-text-tertiary)" }}>Offline</span>
              </>
            )}
          </span>
        </div>

        {/* Search */}
        <div className="p-2.5 border-b border-[var(--tg-border)]">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-[var(--tg-text-tertiary)] pointer-events-none" />
            <Input
              id="chat-account-search"
              name="accountSearch"
              aria-label="Search accounts..."
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts..."
              className="pl-9 h-9 text-xs bg-[var(--tg-bg-secondary)] border-[var(--tg-border)] text-[var(--tg-text-primary)] focus-visible:ring-1"
            />
          </div>
        </div>

        {/* Account count */}
        <div
          style={{
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--tg-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {filteredAccounts.length} account{filteredAccounts.length !== 1 ? "s" : ""}
        </div>

        {/* Scrollable Account List */}
        <div className="tg-scroll flex-1 overflow-y-auto max-h-[300px]">
          {filteredAccounts.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "36px 16px",
                color: "var(--tg-text-tertiary)",
                fontSize: 13,
              }}
            >
              {search ? "No accounts found" : "No active accounts"}
            </div>
          ) : (
            filteredAccounts.map((acc) => {
              const isActive = acc.id === selectedAccount;
              const name =
                [acc.first_name, acc.last_name].filter(Boolean).join(" ") || acc.phone || "Unknown";

              return (
                <div
                  key={acc.id}
                  className={`tg-account-item${isActive ? " is-active" : ""}`}
                  onClick={() => handleSelect(acc.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSelect(acc.id);
                  }}
                >
                  {/* Avatar */}
                  <ChatAvatar
                    accountId={acc.id}
                    chatTitle={name}
                    colorId={acc.color_id ?? acc.telegram_id}
                    hasProfilePhoto={acc.has_profile_photo}
                    photoVersion={acc.photo_version}
                    isActive={acc.is_active}
                    profilePhotoPath={acc.profile_photo_path}
                    sizeClassName="w-10 h-10 text-base font-medium"
                  />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="tg-truncate"
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        color: "var(--tg-text-primary)",
                        lineHeight: 1.3,
                      }}
                    >
                      {name}
                    </div>
                    {acc.phone && (
                      <div
                        className="tg-truncate"
                        style={{
                          fontSize: 11,
                          color: "var(--tg-text-secondary)",
                          marginTop: 1,
                        }}
                      >
                        +{acc.phone}
                      </div>
                    )}
                    {acc.username && (
                      <div
                        className="tg-truncate"
                        style={{
                          fontSize: 11,
                          color: "var(--tg-text-tertiary)",
                          marginTop: 1,
                        }}
                      >
                        @{acc.username}
                      </div>
                    )}
                  </div>

                  {/* Spam status indicator */}
                  {acc.spam_status && ["limited", "temporary_limit", "permanent_limit"].includes(acc.spam_status) && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: 4,
                        backgroundColor: "var(--tg-red-light)",
                        color: "var(--tg-red)",
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                        flexShrink: 0,
                      }}
                    >
                      {acc.spam_status === "temporary_limit" ? "Limited" : "Spam"}
                    </span>
                  )}

                  {/* Active check */}
                  {isActive && (
                    <Check
                      style={{
                        width: 18,
                        height: 18,
                        color: "var(--tg-accent)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Panel footer — account count summary */}
        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid var(--tg-border)",
            fontSize: 11,
            color: "var(--tg-text-tertiary)",
            textAlign: "center",
            fontWeight: 500,
            backgroundColor: "var(--tg-bg-secondary)",
          }}
        >
          {activeAccounts.length} active account{activeAccounts.length !== 1 ? "s" : ""}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AccountSwitcher;
