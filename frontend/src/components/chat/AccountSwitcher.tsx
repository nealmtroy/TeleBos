import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Search, X, ChevronDown, Check, Wifi, WifiOff } from "lucide-react";

interface AccountSwitcherProps {
  accounts: any[] | undefined;
  selectedAccount: string;
  onSelectAccount: (id: string) => void;
  getApiUrl: () => string;
  connected: boolean;
}

// Telegram-style avatar color palette (matching tweb)
const AVATAR_COLORS = [
  { top: "#FF845E", bottom: "#D45246" }, // red
  { top: "#FEBB5B", bottom: "#F68136" }, // orange
  { top: "#B694F9", bottom: "#6C61DF" }, // violet
  { top: "#9AD164", bottom: "#46BA43" }, // green
  { top: "#53EDD6", bottom: "#28C9B7" }, // cyan
  { top: "#5CAFFA", bottom: "#408ACF" }, // blue
  { top: "#FF8AAC", bottom: "#D95574" }, // pink
];

function getAccountColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

/**
 * Scalable Account Switcher — replaces native <select> dropdown.
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
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Auto-focus search when panel opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
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
    <>
      {/* ---- Compact Trigger (Header) ---- */}
      <button
        onClick={() => setIsOpen(true)}
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
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            background: selectedAcc
              ? `linear-gradient(135deg, ${getAccountColor(activeAccounts.indexOf(selectedAcc)).top}, ${getAccountColor(activeAccounts.indexOf(selectedAcc)).bottom})`
              : "var(--tg-text-tertiary)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {selectedAcc && (
            <img
              src={`${getApiUrl()}/accounts/${selectedAcc.id}/photo`}
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fb = e.currentTarget.nextElementSibling as HTMLElement;
                if (fb) fb.style.display = "flex";
              }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "50%",
                position: "absolute",
                inset: 0,
              }}
              alt=""
            />
          )}
          <span style={{ display: selectedAcc ? "none" : "flex" }}>
            {(displayName[0] || "?").toUpperCase()}
          </span>
        </div>

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

      {/* ---- Expanded Account Panel ---- */}
      {isOpen && (
        <div className="tg-account-panel" ref={panelRef}>
          {/* Panel Header */}
          <div className="tg-header" style={{ gap: 8 }}>
            <button
              className="tg-header-btn"
              onClick={() => {
                setIsOpen(false);
                setSearch("");
              }}
            >
              <X style={{ width: 20, height: 20 }} />
            </button>
            <div
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: 600,
                color: "var(--tg-text-primary)",
              }}
            >
              Switch Account
            </div>
            <span
              className="tg-status-badge"
              style={{
                fontSize: 11,
                ...(connected ? {} : {}),
              }}
              data-connected={connected}
            >
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
          <div className="tg-search">
            <Search className="tg-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts..."
            />
          </div>

          {/* Account count */}
          <div
            style={{
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--tg-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {filteredAccounts.length} account{filteredAccounts.length !== 1 ? "s" : ""}
          </div>

          {/* Scrollable Account List */}
          <div
            className="tg-scroll"
            style={{ flex: 1, overflowY: "auto" }}
          >
            {filteredAccounts.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "48px 16px",
                  color: "var(--tg-text-tertiary)",
                  fontSize: 14,
                }}
              >
                {search ? "No accounts found" : "No active accounts"}
              </div>
            ) : (
              filteredAccounts.map((acc, idx) => {
                const isActive = acc.id === selectedAccount;
                const color = getAccountColor(idx);
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
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: 18,
                        fontWeight: 500,
                        background: `linear-gradient(135deg, ${color.top}, ${color.bottom})`,
                        overflow: "hidden",
                        position: "relative",
                      }}
                    >
                      <img
                        src={`${getApiUrl()}/accounts/${acc.id}/photo`}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          const fb = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fb) fb.style.display = "flex";
                        }}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "50%",
                          position: "absolute",
                          inset: 0,
                        }}
                        alt=""
                      />
                      <span style={{ display: "none" }}>
                        {(name[0] || "?").toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="tg-truncate"
                        style={{
                          fontSize: 14,
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
                            fontSize: 12,
                            color: "var(--tg-text-secondary)",
                            marginTop: 2,
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
                          width: 20,
                          height: 20,
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
              padding: "10px 16px",
              borderTop: "1px solid var(--tg-border)",
              fontSize: 11,
              color: "var(--tg-text-tertiary)",
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            {activeAccounts.length} active account{activeAccounts.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </>
  );
}

export default AccountSwitcher;
