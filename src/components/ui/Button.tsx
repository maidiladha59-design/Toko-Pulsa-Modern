"use client";

// Button standar Design System AIDIL STORE.
// Varian: primary (emas flat glossy), secondary (hitam solid), outline, ghost,
// destructive (merah). Ukuran sm/md/lg. Mendukung state loading & disabled.
// Selalu pakai token tema (app-*) / token semantik supaya dual-mode aman.

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "btn-gold",
  secondary:
    "bg-zinc-950 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700",
  outline:
    "border border-app-border bg-transparent text-app-text hover:border-gold-400 hover:bg-app-accent-soft",
  ghost: "bg-transparent text-app-text hover:bg-app-inset",
  destructive:
    "bg-danger-600 text-white hover:bg-danger-700 dark:bg-danger-500 dark:hover:bg-danger-600",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-sm sm:text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950/25 border-t-zinc-950 dark:border-white/30 dark:border-t-white"
        />
      )}
      {children}
    </button>
  );
}
