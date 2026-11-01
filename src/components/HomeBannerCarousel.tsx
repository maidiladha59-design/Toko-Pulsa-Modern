"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

// Slider banner beranda. Daftar banner sudah disaring server: aktif, punya
// gambar, dan berada di dalam jadwal tampil. Bila tidak ada satu pun, komponen
// tidak merender apa-apa sehingga tidak ada ruang kosong di beranda.

export type HomeBannerItem = {
  id: string;
  imageUrl: string;
  alt: string;
  href: string;
};

export default function HomeBannerCarousel({ banners }: { banners: HomeBannerItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % banners.length), 4000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const safeIndex = index >= banners.length ? 0 : index;
  const banner = banners[safeIndex];
  const image = (
    <div className="relative aspect-[16/7] w-full bg-app-inset">
      <Image
        src={banner.imageUrl}
        alt={banner.alt || "Banner AIDIL STORE"}
        fill
        sizes="(min-width: 1024px) 1024px, 100vw"
        className="object-cover"
        priority={safeIndex === 0}
      />
    </div>
  );

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-app-border bg-app-surface shadow-sm">
      {banner.href ? (
        banner.href.startsWith("/") ? (
          <Link href={banner.href} aria-label={banner.alt || "Buka banner"}>
            {image}
          </Link>
        ) : (
          <a href={banner.href} target="_blank" rel="noopener noreferrer" aria-label={banner.alt || "Buka banner"}>
            {image}
          </a>
        )
      ) : (
        image
      )}
      {banners.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 p-3">
          {banners.map((item, position) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Banner ${position + 1} dari ${banners.length}`}
              aria-current={position === safeIndex}
              onClick={() => setIndex(position)}
              className={`h-2 rounded-full transition ${
                position === safeIndex ? "w-7 bg-app-text" : "w-2 bg-app-subtle/60"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
