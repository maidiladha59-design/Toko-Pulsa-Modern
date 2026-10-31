"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Icon from "@/components/icons/Icon";

// Placeholder abu-abu 1x1: mencegah layout shift dan memberi kesan skeleton
// sebelum gambar selesai dimuat.
const BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

type Props = {
  src?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  sizes?: string;
  priority?: boolean;
  fill?: boolean;
  width?: number;
  height?: number;
  iconSize?: number;
  fallbackIcon?: string;
  fit?: "cover" | "contain";
};

function renderable(src?: string | null) {
  return Boolean(src && !/\.pdf(?:$|\?)/i.test(src));
}

export default function ProductImage({
  src,
  alt,
  className = "",
  imgClassName = "",
  sizes,
  priority = false,
  fill = false,
  width = 512,
  height = 512,
  iconSize = 28,
  fallbackIcon = "bag",
  fit = "cover",
}: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  const showImage = renderable(src) && !failed;
  const objectFit = fit === "contain" ? "object-contain" : "object-cover";

  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-app-inset ${className}`}>
      {showImage ? (
        fill ? (
          <Image
            src={src as string}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            placeholder="blur"
            blurDataURL={BLUR}
            className={`${objectFit} ${imgClassName}`}
            onError={() => setFailed(true)}
          />
        ) : (
          <Image
            src={src as string}
            alt={alt}
            width={width}
            height={height}
            sizes={sizes}
            priority={priority}
            placeholder="blur"
            blurDataURL={BLUR}
            className={`h-full w-full ${objectFit} ${imgClassName}`}
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <Icon name={fallbackIcon} size={iconSize} className="text-app-subtle" />
      )}
    </div>
  );
}
