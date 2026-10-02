-- AIDIL STORE v78 THEME PREFERENCE (dark/light mode)
-- Run after v77.
-- Kolom preferensi tema UI ('light' | 'dark' | 'system') di user_app_settings.
-- NULL (default) = ikuti sistem. Kebijakan RLS own_settings (auth.uid()=user_id)
-- sudah mencakup kolom baru: user hanya membaca/menulis baris miliknya.

alter table public.user_app_settings
  add column if not exists theme_preference text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_app_settings_theme_preference_check') then
    alter table public.user_app_settings
      add constraint user_app_settings_theme_preference_check
      check (theme_preference in ('light','dark','system'));
  end if;
end $$;
