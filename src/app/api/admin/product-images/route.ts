import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_PRODUCT_IMAGE_INPUT_BYTES,
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_TYPES,
  normalizeBrandKey,
  publicStorageRef,
  sniffProductImageType,
} from "@/lib/product-image";

const PAGE_SIZE = 1000;
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }
  return { user };
}

type Admin = ReturnType<typeof createAdminClient>;

// PostgREST memotong hasil di 1000 baris; brand PPOB bisa jauh lebih banyak,
// jadi daftar brand dibaca bertahap agar hitungan produk tidak salah.
async function loadBrandRows(admin: Admin) {
  const rows: { product_id: string; brand: string }[] = [];
  for (let from = 0; from < 200000; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("ppob_services")
      .select("product_id,brand")
      .not("brand", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("[product-images] baca brand PPOB gagal", { code: error.code, message: error.message });
      break;
    }
    const page = (data || []) as { product_id: string; brand: string }[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadProductImages(admin: Admin) {
  const rows: { product_id: string; image_url: string }[] = [];
  for (let from = 0; from < 200000; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("product_images")
      .select("product_id,image_url")
      .order("product_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("[product-images] baca product_images gagal (migrasi v100 belum dijalankan?)", {
        code: error.code,
        message: error.message,
      });
      break;
    }
    const page = (data || []) as { product_id: string; image_url: string }[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function removePublicFile(admin: Admin, url?: string | null, keepUrl?: string | null) {
  if (!url || url === keepUrl) return;
  const ref = publicStorageRef(url);
  if (!ref) return;
  const { error } = await admin.storage.from(ref.bucket).remove([ref.path]);
  if (error) {
    console.error("[product-images] hapus file lama gagal", {
      bucket: ref.bucket,
      path: ref.path,
      message: error.message,
    });
  }
}

function refreshAdminViews() {
  revalidatePath("/");
  revalidatePath("/admin/products");
  revalidatePath("/admin/product-images");
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const admin = createAdminClient();

  const [
    { data: productData, error: productError },
    brandRows,
    imageRows,
    { data: mediaData, error: mediaError },
    { data: categoryData, error: categoryError },
  ] = await Promise.all([
    admin
      .from("products")
      .select("id,name,slug,thumbnail_url,is_active,category_id,created_at,categories(slug)")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    loadBrandRows(admin),
    loadProductImages(admin),
    admin.from("brand_media").select("brand_key,brand_name,logo_url,updated_at"),
    admin.from("category_media").select("category_key,icon_url"),
  ]);

  if (productError) {
    console.error("[product-images] baca produk gagal", { code: productError.code, message: productError.message });
    return NextResponse.json({ message: "Gagal memuat daftar produk." }, { status: 500 });
  }
  if (mediaError) console.error("[product-images] baca brand_media gagal", { code: mediaError.code, message: mediaError.message });
  if (categoryError) console.error("[product-images] baca category_media gagal", { code: categoryError.code, message: categoryError.message });

  const categoryImageByKey = new Map(
    ((categoryData || []) as { category_key: string; icon_url: string | null }[]).map((row) => [
      String(row.category_key || "").toLowerCase(),
      row.icon_url,
    ])
  );
  const imageByProduct = new Map(imageRows.map((row) => [row.product_id, row.image_url]));
  const brandByProduct = new Map(brandRows.map((row) => [row.product_id, String(row.brand || "").trim()]));
  const mediaByKey = new Map((mediaData || []).map((row) => [row.brand_key, row]));

  const counts = new Map<string, { brand_name: string; product_count: number }>();
  for (const row of brandRows) {
    const name = String(row.brand || "").trim();
    if (!name) continue;
    const key = normalizeBrandKey(name);
    const found = counts.get(key);
    if (found) found.product_count += 1;
    else counts.set(key, { brand_name: name, product_count: 1 });
  }

  const brands = Array.from(counts.entries())
    .map(([brand_key, info]) => ({
      brand_key,
      brand_name: mediaByKey.get(brand_key)?.brand_name || info.brand_name,
      logo_url: mediaByKey.get(brand_key)?.logo_url || null,
      updated_at: mediaByKey.get(brand_key)?.updated_at || null,
      product_count: info.product_count,
    }))
    .sort((a, b) => a.brand_name.localeCompare(b.brand_name, "id"));

  const products = ((productData || []) as {
    id: string;
    name: string;
    slug: string;
    thumbnail_url: string | null;
    is_active: boolean;
    category_id: string | null;
    categories: { slug: string } | { slug: string }[] | null;
  }[]).map((product) => {
    const brand = brandByProduct.get(product.id) || null;
    const brandLogo = brand ? mediaByKey.get(normalizeBrandKey(brand))?.logo_url || null : null;
    const category = Array.isArray(product.categories) ? product.categories[0] : product.categories;
    const categoryKey = category?.slug ? String(category.slug).toLowerCase() : null;
    return {
      ...product,
      categories: undefined,
      image_url: imageByProduct.get(product.id) || null,
      brand,
      brand_logo_url: brandLogo,
      category_key: categoryKey,
      category_image_url: categoryKey ? categoryImageByKey.get(categoryKey) || null : null,
    };
  });

  return NextResponse.json({ products, brands });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ message: "Unggahan tidak valid." }, { status: 400 });

  const scope = String(form.get("scope") || "");
  const ref = String(form.get("ref") || "").trim();
  if (!["product", "brand"].includes(scope)) {
    return NextResponse.json({ message: "Jenis gambar tidak dikenal." }, { status: 400 });
  }
  if (!ref) return NextResponse.json({ message: "Target gambar wajib diisi." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ message: "Belum ada gambar yang dipilih." }, { status: 400 });
  }
  if (file.size > MAX_PRODUCT_IMAGE_INPUT_BYTES) {
    return NextResponse.json({ message: "Ukuran gambar maksimal 2 MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const realType = sniffProductImageType(bytes);
  if (!realType || !PRODUCT_IMAGE_TYPES.includes(realType)) {
    return NextResponse.json({ message: "Gambar harus berformat JPG, PNG, atau WEBP." }, { status: 400 });
  }

  const admin = createAdminClient();
  const ext = EXT_BY_TYPE[realType];
  const altInput = String(form.get("alt") || "").trim().slice(0, 160);
  const now = new Date().toISOString();

  if (scope === "product") {
    const { data: product, error: productError } = await admin
      .from("products")
      .select("id,name,thumbnail_url")
      .eq("id", ref)
      .maybeSingle();
    if (productError) console.error("[product-images] baca produk gagal", { code: productError.code, message: productError.message });
    if (!product) return NextResponse.json({ message: "Produk tidak ditemukan." }, { status: 404 });

    const { data: existing } = await admin
      .from("product_images")
      .select("image_url")
      .eq("product_id", ref)
      .maybeSingle();

    const path = `products/${ref}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, bytes, {
      contentType: realType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) {
      console.error("[product-images] unggah gambar produk gagal", {
        product_id: ref,
        name: uploadError.name,
        message: uploadError.message,
        statusCode: uploadError.statusCode,
      });
      return NextResponse.json({ message: "Gagal mengunggah gambar. Coba lagi." }, { status: 500 });
    }

    const { data: publicData } = admin.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
    const imageUrl = publicData.publicUrl;

    const { error: saveError } = await admin.from("product_images").upsert(
      {
        product_id: ref,
        image_url: imageUrl,
        alt_text: altInput || product.name,
        updated_by: auth.user!.id,
        updated_at: now,
      },
      { onConflict: "product_id" }
    );
    if (saveError) {
      console.error("[product-images] simpan product_images gagal", {
        product_id: ref,
        code: saveError.code,
        message: saveError.message,
        details: saveError.details,
      });
      await admin.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
      return NextResponse.json(
        { message: "Gagal menyimpan gambar produk. Pastikan migrasi v100 sudah dijalankan." },
        { status: 500 }
      );
    }

    await removePublicFile(admin, existing?.image_url, imageUrl);
    await removePublicFile(admin, product.thumbnail_url, imageUrl);

    await admin.from("audit_logs").insert({
      actor_id: auth.user!.id,
      action: "productimage.update",
      target_type: "product",
      metadata: { product_id: ref, image_url: imageUrl },
    });

    refreshAdminViews();
    return NextResponse.json({ scope, ref, image_url: imageUrl, source: "product" });
  }

  const brandKey = normalizeBrandKey(ref);
  if (!brandKey) return NextResponse.json({ message: "Nama brand tidak valid." }, { status: 400 });

  const { data: mediaRow } = await admin
    .from("brand_media")
    .select("brand_key,brand_name,logo_url")
    .eq("brand_key", brandKey)
    .maybeSingle();
  const { data: serviceRow } = await admin
    .from("ppob_services")
    .select("brand")
    .ilike("brand", brandKey)
    .limit(1)
    .maybeSingle();
  if (!mediaRow && !serviceRow) {
    return NextResponse.json({ message: "Brand tidak ditemukan pada data produk." }, { status: 400 });
  }

  const brandName = String(mediaRow?.brand_name || serviceRow?.brand || brandKey).trim();
  const folder = brandKey.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "brand";
  const path = `brands/${folder}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, bytes, {
    contentType: realType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) {
    console.error("[product-images] unggah gambar brand gagal", {
      brand_key: brandKey,
      name: uploadError.name,
      message: uploadError.message,
      statusCode: uploadError.statusCode,
    });
    return NextResponse.json({ message: "Gagal mengunggah gambar brand. Coba lagi." }, { status: 500 });
  }

  const { data: publicData } = admin.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  const imageUrl = publicData.publicUrl;

  const { error: saveError } = await admin.from("brand_media").upsert(
    {
      brand_key: brandKey,
      brand_name: brandName,
      logo_url: imageUrl,
      updated_by: auth.user!.id,
      updated_at: now,
    },
    { onConflict: "brand_key" }
  );
  if (saveError) {
    console.error("[product-images] simpan brand_media gagal", {
      brand_key: brandKey,
      code: saveError.code,
      message: saveError.message,
    });
    await admin.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
    return NextResponse.json({ message: "Gagal menyimpan gambar brand." }, { status: 500 });
  }

  await removePublicFile(admin, mediaRow?.logo_url, imageUrl);

  await admin.from("audit_logs").insert({
    actor_id: auth.user!.id,
    action: "brandmedia.update",
    target_type: "brand_media",
    metadata: { brand_key: brandKey, image_url: imageUrl },
  });

  refreshAdminViews();
  return NextResponse.json({ scope, ref: brandKey, image_url: imageUrl, source: "brand" });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "";
  const ref = String(url.searchParams.get("ref") || "").trim();
  if (!["product", "brand"].includes(scope) || !ref) {
    return NextResponse.json({ message: "Target gambar tidak valid." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (scope === "product") {
    const { data: product } = await admin
      .from("products")
      .select("id,thumbnail_url")
      .eq("id", ref)
      .maybeSingle();
    if (!product) return NextResponse.json({ message: "Produk tidak ditemukan." }, { status: 404 });

    const { data: existing } = await admin
      .from("product_images")
      .select("image_url")
      .eq("product_id", ref)
      .maybeSingle();

    // Menghapus gambar khusus produk = kembali memakai gambar brand/kategori.
    const { error: deleteError } = await admin.from("product_images").delete().eq("product_id", ref);
    if (deleteError) {
      console.error("[product-images] hapus product_images gagal", {
        product_id: ref,
        code: deleteError.code,
        message: deleteError.message,
      });
      return NextResponse.json({ message: "Gagal menghapus gambar produk." }, { status: 500 });
    }

    const { error: resetError } = await admin
      .from("products")
      .update({ thumbnail_url: null, updated_at: new Date().toISOString() })
      .eq("id", ref);
    if (resetError) console.error("[product-images] reset thumbnail_url gagal", { code: resetError.code, message: resetError.message });

    await removePublicFile(admin, existing?.image_url);
    await removePublicFile(admin, product.thumbnail_url);

    await admin.from("audit_logs").insert({
      actor_id: auth.user!.id,
      action: "productimage.reset",
      target_type: "product",
      metadata: { product_id: ref },
    });

    refreshAdminViews();
    return NextResponse.json({ message: "Gambar khusus produk dihapus. Produk kembali memakai gambar brand." });
  }

  const brandKey = normalizeBrandKey(ref);
  const { data: mediaRow } = await admin
    .from("brand_media")
    .select("brand_key,logo_url")
    .eq("brand_key", brandKey)
    .maybeSingle();
  if (!mediaRow) return NextResponse.json({ message: "Gambar brand belum ada." }, { status: 404 });

  const { error: deleteError } = await admin.from("brand_media").delete().eq("brand_key", brandKey);
  if (deleteError) {
    console.error("[product-images] hapus brand_media gagal", { code: deleteError.code, message: deleteError.message });
    return NextResponse.json({ message: "Gagal menghapus gambar brand." }, { status: 500 });
  }
  await removePublicFile(admin, mediaRow.logo_url);

  await admin.from("audit_logs").insert({
    actor_id: auth.user!.id,
    action: "brandmedia.delete",
    target_type: "brand_media",
    metadata: { brand_key: brandKey },
  });

  refreshAdminViews();
  return NextResponse.json({ message: "Gambar brand dihapus." });
}
