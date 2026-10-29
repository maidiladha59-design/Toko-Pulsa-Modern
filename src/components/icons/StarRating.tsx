import Icon from "./Icon";

/** Deret bintang rating. Dipakai di ulasan, peringkat, dan panel admin. */
export default function StarRating({
  value,
  total = 5,
  size = 16,
  className = "",
  label,
}: {
  value: number;
  total?: number;
  size?: number;
  className?: string;
  label?: string;
}) {
  const filled = Math.max(0, Math.min(total, Math.round(Number(value) || 0)));
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 align-middle ${className}`}
      role="img"
      aria-label={label ?? `${filled} dari ${total} bintang`}
    >
      {Array.from({ length: total }, (_, index) => (
        <Icon
          key={index}
          name={index < filled ? "star_fill" : "star"}
          size={size}
          className={index < filled ? "text-gold-500" : "text-app-border"}
        />
      ))}
    </span>
  );
}
