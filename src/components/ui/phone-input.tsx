"use client";

import React from "react";
import PhoneInputLib from "react-phone-number-input";
import type { Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
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
 * Uses inline SVG flags (no external CDN) and matches the app design system.
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
    <div className={cn("phone-input-wrapper", className)}>
      <PhoneInputLib
        id={id}
        international
        countryCallingCodeEditable={false}
        defaultCountry={defaultCountry}
        flags={flags}
        value={value || ""}
        onChange={(val) => onChange(val ?? "")}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
