-- Jalankan sekali pada project Supabase yang SUDAH memiliki schema.
-- Memungkinkan admin mengganti/menghapus thumbnail produk dari dashboard.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'product_thumbnails_admin_insert_v2') then
    create policy "product_thumbnails_admin_insert_v2" on storage.objects
      for insert with check (bucket_id = 'product-thumbnails' and public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'product_thumbnails_admin_update_v2') then
    create policy "product_thumbnails_admin_update_v2" on storage.objects
      for update using (bucket_id = 'product-thumbnails' and public.is_admin())
      with check (bucket_id = 'product-thumbnails' and public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'product_thumbnails_admin_delete_v2') then
    create policy "product_thumbnails_admin_delete_v2" on storage.objects
      for delete using (bucket_id = 'product-thumbnails' and public.is_admin());
  end if;
end $$;
