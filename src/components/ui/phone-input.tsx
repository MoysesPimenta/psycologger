"use client";

import React from "react";
import PhoneInputLib from "react-phone-number-input";
import type { Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: Country;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * International phone input with country flag selector.
 * Wraps react-phone-number-input styled to match the app's design system.
 */
export function PhoneInput({
  value,
  onChange,
  defaultCountry = "BR",
  placeholder = "+55 11 99999-9999",
  className,
  disabled,
  id,
}: PhoneInputProps) {
  return (
    <div
      className={cn(
        "phone-input-wrapper",
        "[&_.PhoneInput]:flex [&_.PhoneInput]:items-center [&_.PhoneInput]:gap-2",
        "[&_.PhoneInputCountry]:flex [&_.PhoneInputCountry]:items-center [&_.PhoneInputCountry]:shrink-0",
        "[&_.PhoneInputCountryIcon]:w-6 [&_.PhoneInputCountryIcon]:h-4 [&_.PhoneInputCountryIcon]:rounded-sm [&_.PhoneInputCountryIcon]:overflow-hidden",
        "[&_.PhoneInputCountryIcon--border]:shadow-none [&_.PhoneInputCountryIcon--border]:bg-transparent",
        "[&_.PhoneInputCountrySelect]:absolute [&_.PhoneInputCountrySelect]:inset-0 [&_.PhoneInputCountrySelect]:opacity-0 [&_.PhoneInputCountrySelect]:cursor-pointer",
        "[&_.PhoneInputCountrySelectArrow]:w-2 [&_.PhoneInputCountrySelectArrow]:h-2 [&_.PhoneInputCountrySelectArrow]:border-muted-foreground",
        "[&_.PhoneInputInput]:flex [&_.PhoneInputInput]:min-h-11 [&_.PhoneInputInput]:w-full [&_.PhoneInputInput]:rounded-md [&_.PhoneInputInput]:border [&_.PhoneInputInput]:border-input [&_.PhoneInputInput]:bg-background [&_.PhoneInputInput]:px-3 [&_.PhoneInputInput]:py-2 [&_.PhoneInputInput]:text-base md:[&_.PhoneInputInput]:text-sm md:[&_.PhoneInputInput]:min-h-10 [&_.PhoneInputInput]:ring-offset-background [&_.PhoneInputInput]:placeholder:text-muted-foreground [&_.PhoneInputInput]:focus-visible:outline-none [&_.PhoneInputInput]:focus-visible:ring-2 [&_.PhoneInputInput]:focus-visible:ring-ring [&_.PhoneInputInput]:focus-visible:ring-offset-2 [&_.PhoneInputInput]:disabled:cursor-not-allowed [&_.PhoneInputInput]:disabled:opacity-50",
        className
      )}
    >
      <PhoneInputLib
        id={id}
        international
        countryCallingCodeEditable={false}
        defaultCountry={defaultCountry}
        value={value || ""}
        onChange={(val) => onChange(val ?? "")}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
