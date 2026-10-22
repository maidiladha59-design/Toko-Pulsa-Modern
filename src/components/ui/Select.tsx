import { useId } from "react";

// Select standar Design System AIDIL STORE — styling sama dengan Input
// (label + state error + focus emas), dengan panah kustom konsisten.
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string | null;
  hint?: string;
};

export default function Select({
  label,
  error,
  hint,
  className = "",
  id,
  children,
  ...props
}: SelectProps) {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-2 block text-sm font-bold text-app-text">
          {label}
        </label>
      )}
      <span className="relative block">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          className={`w-full appearance-none rounded-xl border bg-app-surface px-4 py-3 pr-10 text-sm text-app-text outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus:ring-4 ${
            error
              ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/20"
              : "border-app-border focus:border-gold-400 focus:ring-gold-400/20"
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-app-subtle">
          ▾
        </span>
      </span>
      {error ? (
        <p id={`${selectId}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger-600 dark:text-danger-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${selectId}-hint`} className="mt-1.5 text-xs text-app-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
