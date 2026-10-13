"use client";

import { useMemo } from "react";
import { Check, ShieldCheck, ShieldAlert } from "lucide-react";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface PasswordCriteria {
  minLength: boolean;
  hasUpperLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export function evaluatePasswordCriteria(password: string): PasswordCriteria {
  return {
    minLength: password.length >= 8,
    hasUpperLower: /[a-z]/.test(password) && /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}

export function calculatePasswordScore(password: string, criteria: PasswordCriteria): number {
  if (!password) return 0;

  let passed = 0;
  if (criteria.minLength) passed++;
  if (criteria.hasUpperLower) passed++;
  if (criteria.hasNumber) passed++;
  if (criteria.hasSpecial) passed++;

  // A password shorter than 8 characters can never exceed score 1 (Weak)
  if (!criteria.minLength) {
    return 1;
  }

  return Math.max(1, passed);
}

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

export function PasswordStrengthIndicator({
  password,
  className,
}: PasswordStrengthIndicatorProps) {
  const _ = useT();

  const criteria = useMemo(() => evaluatePasswordCriteria(password), [password]);
  const score = useMemo(() => calculatePasswordScore(password, criteria), [password, criteria]);

  const strength = useMemo(() => {
    switch (score) {
      case 1:
        return {
          label: _("register.strengthWeak"),
          textColor: "text-rose-400",
          barColor: "bg-rose-500",
          Icon: ShieldAlert,
        };
      case 2:
        return {
          label: _("register.strengthFair"),
          textColor: "text-amber-400",
          barColor: "bg-amber-500",
          Icon: ShieldAlert,
        };
      case 3:
        return {
          label: _("register.strengthGood"),
          textColor: "text-sky-400",
          barColor: "bg-sky-500",
          Icon: ShieldCheck,
        };
      case 4:
      default:
        return {
          label: _("register.strengthStrong"),
          textColor: "text-emerald-400",
          barColor: "bg-emerald-500",
          Icon: ShieldCheck,
        };
    }
  }, [score, _]);

  if (!password) return null;

  const criteriaList = [
    {
      id: "min-length",
      testId: "password-criteria-min-length",
      met: criteria.minLength,
      label: _("register.criteriaMinLength"),
    },
    {
      id: "upper-lower",
      testId: "password-criteria-upper-lower",
      met: criteria.hasUpperLower,
      label: _("register.criteriaUpperLower"),
    },
    {
      id: "number",
      testId: "password-criteria-number",
      met: criteria.hasNumber,
      label: _("register.criteriaNumber"),
    },
    {
      id: "special",
      testId: "password-criteria-special",
      met: criteria.hasSpecial,
      label: _("register.criteriaSpecial"),
    },
  ];

  const IconComponent = strength.Icon;

  return (
    <div
      data-testid="password-strength-indicator"
      role="status"
      aria-live="polite"
      className={cn(
        "mt-2.5 rounded-[8px] border border-[var(--public-border)] bg-[var(--public-canvas-warm)] p-3 transition-all duration-200",
        className
      )}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-[var(--public-muted)]">
          <IconComponent className={cn("h-3.5 w-3.5 shrink-0", strength.textColor)} aria-hidden="true" />
          <span>{_("register.passwordStrength")}</span>
        </span>
        <span
          data-testid="password-strength-label"
          className={cn("font-medium transition-colors duration-200", strength.textColor)}
        >
          {strength.label}
        </span>
      </div>

      {/* 4-step strength meter bars */}
      <div
        data-testid="password-strength-meter"
        className="mt-2 grid grid-cols-4 gap-1.5"
        aria-hidden="true"
      >
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            data-testid={`password-strength-bar-${step}`}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300 ease-out",
              step <= score ? strength.barColor : "bg-[var(--public-border)]"
            )}
          />
        ))}
      </div>

      {/* Criteria requirements checklist */}
      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2.5 border-t border-[var(--public-border)]/60 text-xs">
        {criteriaList.map((crit) => (
          <div
            key={crit.id}
            data-testid={crit.testId}
            className={cn(
              "flex items-center gap-1.5 transition-colors duration-150 text-[11px]",
              crit.met ? "text-[var(--public-body)] font-medium" : "text-[var(--public-subtle)]"
            )}
          >
            <span
              className={cn(
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                crit.met
                  ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                  : "border-[var(--public-border)] bg-transparent text-transparent"
              )}
              aria-hidden="true"
            >
              <Check className={cn("h-2.5 w-2.5", crit.met ? "opacity-100" : "opacity-0")} />
            </span>
            <span>{crit.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
