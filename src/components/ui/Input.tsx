import { useId } from "react";

// Input standar Design System AIDIL STORE: label + field + pesan error/hint.
// State error tegas (border & ring merah + pesan di bawah field),
// state focus terlihat jelas (border & ring biru brand).
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string | null;
  hint?: string;
};

export default function Input({
  label,
  error,
  hint,
  className = "",
  id,
  ...props
}: InputProps) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-2 block text-sm font-bold text-app-text">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={`w-full rounded-xl border bg-app-surface px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 disabled:cursor-not-allowed disabled:opacity-60 focus:ring-4 ${
          error
            ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/20"
            : "border-app-border focus:border-gold-400 focus:ring-gold-400/20"
        } ${className}`}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger-600 dark:text-danger-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-app-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
