"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import PushNotificationRegistrar from '@/components/PushNotificationRegistrar';
import ThemeToggle from '@/components/ThemeToggle';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

const NOTIF_CATEGORIES: { key: 'transactions'|'topup'|'kyc'|'security'|'promotions'|'announcements'; label: string; desc: string }[] = [
  { key: 'transactions', label: 'Transaksi', desc: 'Hasil pembelian/transaksi PPOB (berhasil, gagal, dsb).' },
  { key: 'topup', label: 'Top Up Saldo', desc: 'Status top up saldo (berhasil, akan kedaluwarsa, dsb).' },
  { key: 'kyc', label: 'KYC', desc: 'Status pengajuan verifikasi KYC.' },
  { key: 'security', label: 'Keamanan', desc: 'Login baru dan aktivitas keamanan akun.' },
  { key: 'promotions', label: 'Promosi', desc: 'Info promo dan diskon.' },
  { key: 'announcements', label: 'Pengumuman', desc: 'Pengumuman umum dari AIDIL STORE.' },
];

export default function Settings(){
  const s=createClient();
  const[d,setD]=useState<any>({receipt_paper:'58mm',show_receipt_settings:true,login_otp_email:false,email_notifications:true});
  const[pinSet,setPinSet]=useState(false); const[pin,setPin]=useState(''); const[currentPin,setCurrentPin]=useState(''); const[pinBusy,setPinBusy]=useState(false);
  const[notifPrefs,setNotifPrefs]=useState<any>({transactions:true,topup:true,kyc:true,security:true,promotions:true,announcements:true});
  useEffect(()=>{(async()=>{const{data:{user}}=await s.auth.getUser();if(!user)return;const[{data:settings},{data:sec},{data:prefs}]=await Promise.all([s.from('user_app_settings').select('*').eq('user_id',user.id).maybeSingle(),fetch('/api/security/transaction-pin').then(r=>r.json()),s.from('notification_preferences').select('*').eq('user_id',user.id).maybeSingle()]);if(settings)setD(settings);if(sec)setPinSet(Boolean(sec.pin_set));if(prefs)setNotifPrefs(prefs)})()},[s]);
  async function save(){const{data:{user}}=await s.auth.getUser();if(!user)return;const{theme_preference,...settingsRow}=d;const[{error},{error:notifError}]=await Promise.all([s.from('user_app_settings').upsert({...settingsRow,user_id:user.id,updated_at:new Date().toISOString()}),s.from('notification_preferences').upsert({...notifPrefs,user_id:user.id,updated_at:new Date().toISOString()})]);alert(error?.message||notifError?.message||'Pengaturan tersimpan.')}
  async function savePin(){if(!/^\d{6}$/.test(pin))return alert('PIN harus 6 digit.');setPinBusy(true);try{const r=await fetch('/api/security/transaction-pin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:pinSet?'change':'set',pin,current_pin:pinSet?currentPin:undefined})});const j=await r.json();alert(j.message||'Selesai');if(r.ok){setPinSet(true);setPin('');setCurrentPin('')}}finally{setPinBusy(false)}}
  return <div className="customer-shell"><div className="mx-auto w-full max-w-[480px] space-y-5 animate-page-in lg:max-w-2xl"><div><p className="text-xs font-black uppercase tracking-widest text-app-kicker">Pengaturan</p><h1 className="text-2xl font-black text-app-text sm:text-3xl">Pengaturan Akun</h1></div>
    <Card>
      <h2 className="text-base font-black text-app-text">Tampilan</h2>
      <p className="mt-1 text-xs text-app-subtle">Pilih tema aplikasi. Saat Anda masuk, pilihan ini tersimpan di akun dan terbawa ke perangkat lain.</p>
      <div className="mt-3"><ThemeToggle variant="block"/></div>
    </Card>
    <Card><h2 className="text-base font-black text-app-text">PIN Transaksi</h2><p className="mt-1 text-xs text-app-subtle">PIN 6 digit digunakan saat pembayaran menggunakan saldo. PIN tidak disimpan sebagai teks biasa.</p>{pinSet&&<Input inputMode="numeric" maxLength={6} value={currentPin} onChange={e=>setCurrentPin(e.target.value.replace(/\D/g,''))} placeholder="PIN lama" className="mt-3 bg-app-inset"/>}<Input inputMode="numeric" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} placeholder={pinSet?'PIN baru':'Buat PIN 6 digit'} className="mt-3 bg-app-inset"/><Button disabled={pinBusy} onClick={savePin} className="mt-3 px-4 py-3">{pinBusy?'Menyimpan...':pinSet?'Ubah PIN':'Buat PIN'}</Button></Card>
    <Card><h2 className="text-base font-black text-app-text">Cetak Struk</h2><Select value={d.receipt_paper} onChange={e=>setD({...d,receipt_paper:e.target.value})} className="mt-3 bg-app-inset"><option>58mm</option><option>80mm</option></Select><Input value={d.receipt_header||''} onChange={e=>setD({...d,receipt_header:e.target.value})} placeholder="Header" className="mt-3 bg-app-inset"/><Input value={d.receipt_footer||''} onChange={e=>setD({...d,receipt_footer:e.target.value})} placeholder="Footer" className="mt-3 bg-app-inset"/><label className="mt-3 block text-sm text-app-muted"><input type="checkbox" className="accent-gold-400" checked={d.show_receipt_settings} onChange={e=>setD({...d,show_receipt_settings:e.target.checked})}/> Tampilkan pengaturan saat mencetak</label></Card>
    <Card><h2 className="text-base font-black text-app-text">Keamanan & Pemberitahuan</h2><label className="mt-3 block text-sm text-app-muted"><input type="checkbox" className="accent-gold-400" checked={d.login_otp_email} onChange={e=>setD({...d,login_otp_email:e.target.checked})}/> Kirim OTP login melalui Email</label><label className="mt-3 block text-sm text-app-muted"><input type="checkbox" className="accent-gold-400" checked={d.email_notifications} onChange={e=>setD({...d,email_notifications:e.target.checked})}/> Pemberitahuan masuk melalui Email</label></Card>
    <Card>
      <h2 className="text-base font-black text-app-text">Notifikasi</h2>
      <p className="mt-1 text-xs text-app-subtle">Atur notifikasi push di perangkat ini, dan pilih jenis notifikasi apa saja yang mau Anda terima (berlaku untuk notifikasi dalam-app maupun push).</p>
      <div className="mt-3"><PushNotificationRegistrar /></div>
      <div className="mt-3 space-y-3">
        {NOTIF_CATEGORIES.map(c=>(
          <label key={c.key} className="flex items-start gap-3 text-sm text-app-muted">
            <input type="checkbox" className="mt-0.5 accent-gold-400" checked={notifPrefs[c.key]!==false} onChange={e=>setNotifPrefs({...notifPrefs,[c.key]:e.target.checked})}/>
            <span><span className="font-bold text-app-text">{c.label}</span><br/><span className="text-xs text-app-subtle">{c.desc}</span></span>
          </label>
        ))}
      </div>
    </Card>
    <Button onClick={save} className="min-h-[44px] w-full py-3">Simpan Pengaturan</Button></div></div>
}
