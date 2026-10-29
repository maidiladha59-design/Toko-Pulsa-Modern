export { default as Icon } from "./Icon";
export type { IconProps } from "./Icon";
export { default as IconTile } from "./IconTile";
export type { IconTone } from "./IconTile";
export { default as StarRating } from "./StarRating";
export {
  DEFAULT_ICON_NAME,
  ICON_NAMES,
  ICON_REGISTRY,
  isIconName,
  resolveIconName,
} from "./registry";
export type { IconName } from "./registry";
export { mapEmojiToIcon, stripEmoji } from "./emoji-map";
