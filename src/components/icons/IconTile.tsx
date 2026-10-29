import Icon from "./Icon";

export type IconTone = "brand" | "mint" | "success" | "warning" | "danger" | "hero" | "muted";

const TONES: Record<IconTone, string> = {
  brand: "text-app-kicker",
  mint: "text-mint-700 dark:text-mint-300",
  success: "text-success-600 dark:text-success-400",
  warning: "text-warning-600 dark:text-warning-300",
  danger: "text-danger-600 dark:text-danger-400",
  hero: "icon-tile-hero text-white",
  muted: "text-app-subtle",
};

/** Kotak ikon 56px radius 16px dengan gradasi brand halus; ikon 30px di tengah. */
export default function IconTile({
  name,
  size = 56,
  iconSize = 30,
  tone = "brand",
  className = "",
  title,
}: {
  name?: string;
  size?: number;
  iconSize?: number;
  tone?: IconTone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`icon-tile shrink-0 ${TONES[tone] ?? TONES.brand} ${className}`}
      style={{ width: size, height: size }}
    >
      <Icon name={name} size={iconSize} title={title} />
    </span>
  );
}
