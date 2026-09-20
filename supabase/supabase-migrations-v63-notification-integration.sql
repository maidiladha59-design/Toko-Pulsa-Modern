-- V63 notification template for failed top-up
insert into public.notification_templates (event_key,title,subtitle,message) values
('TOPUP_FAILED','Top Up Gagal','Pembayaran Top Up tidak dapat diproses.','Top Up {{reference}} sebesar {{amount}} gagal diproses.')
on conflict (event_key) do nothing;
