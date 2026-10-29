import type { CSSProperties } from "react";
import { DEFAULT_ICON_NAME, ICON_REGISTRY, type IconName, type IconNode } from "./registry";
import { mapEmojiToIcon } from "./emoji-map";

export type IconProps = {
  /** Nama ikon registry. Nilai emoji lama dipetakan otomatis; nama tak dikenal jatuh ke "default". */
  name?: string;
  size?: number;
  className?: string;
  /** Ikon bermakna: isi title membuat ikon diumumkan pembaca layar. Kosong = dekoratif. */
  title?: string;
  style?: CSSProperties;
};

function Node({ node }: { node: IconNode }) {
  if ("fill" in node) return <path d={node.fill} fill="currentColor" stroke="none" />;
  if ("circle" in node) {
    const [cx, cy, radius] = node.circle;
    return <circle cx={cx} cy={cy} r={radius} />;
  }
  if ("rect" in node) {
    const [x, y, width, height, rx] = node.rect;
    return <rect x={x} y={y} width={width} height={height} rx={rx} />;
  }
  return <path d={node.d} />;
}

export default function Icon({ name, size = 20, className = "", title, style }: IconProps) {
  const key: IconName = mapEmojiToIcon(name);
  const nodes = ICON_REGISTRY[key] ?? ICON_REGISTRY[DEFAULT_ICON_NAME];
  const strokeWidth = size >= 40 ? 2 : size <= 14 ? 1.6 : 1.8;
  const labelled = Boolean(title);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {labelled && <title>{title}</title>}
      {nodes.map((node, index) => (
        <Node key={index} node={node} />
      ))}
    </svg>
  );
}
