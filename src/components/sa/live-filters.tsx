"use client";

/**
 * Shared debounced live filter bar for /sa/* list pages (tenants, users, audit).
 *
 * Drives URL search params via router.replace — each page stays a server
 * component and re-fetches when searchParams change. Debounce avoids flooding
 * the DB while the user types.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface FieldSpec {
  name: string;
  kind: "text" | "select" | "date";
  placeholder?: string;
  options?: { value: string; label: string }[]; // for select
  className?: string;
}

interface Props {
  fields: FieldSpec[];
  debounceMs?: number;
  /** Extra params to preserve (e.g. not reset "page" when filter changes). */
  preserve?: string[];
}

export function SaLiveFilters({ fields, debounceMs = 300, preserve = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial: Record<string, string> = {};
  for (const f of fields) initial[f.name] = searchParams.get(f.name) ?? "";
  const [values, setValues] = useState<Record<string, string>>(initial);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      // preserve listed keys from the current URL
      for (const key of preserve) {
        const v = searchParams.get(key);
        if (v) params.set(key, v);
      }
      for (const [k, v] of Object.entries(values)) {
        if (v) params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const update = (name: string, v: string) =>
    setValues((prev) => ({ ...prev, [name]: v }));

  return (
    <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {fields.map((f) => {
          const v = values[f.name] ?? "";
          const base =
            "px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500";
          if (f.kind === "select") {
            return (
              <select
                key={f.name}
                value={v}
                onChange={(e) => update(f.name, e.target.value)}
                className={`${base} ${f.className ?? ""}`}
              >
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            );
          }
          return (
            <input
              key={f.name}
              type={f.kind === "date" ? "date" : "text"}
              placeholder={f.placeholder}
              value={v}
              onChange={(e) => update(f.name, e.target.value)}
              className={`${base} ${f.className ?? ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}
