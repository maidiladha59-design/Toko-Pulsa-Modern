"use client";
import {createClient} from '@/lib/supabase/client';
import {useEffect,useState} from 'react';import Button from '@/components/ui/Button';import { Card, CardTitle, CardDescription } from '@/components/ui/Card';import Badge from '@/components/ui/Badge';import Input from '@/components/ui/Input';import Select from '@/components/ui/Select';import LoadingSkeleton from '@/components/ui/LoadingSkeleton';import {useToast} from '@/components/ToastProvider';
type PaymentMethod={id:string;method:string;account_number:string;account_name:string;instructions:string|null;is_active:boolean};
type TopupMethod={provider_method:string;label:string;description:string|null;payment_type:'QRIS'|'VA';is_active:boolean;sort_order:number};
// Metode Top Up otomatis yang didukung Midtrans Core API: QRIS + Virtual Account bank.
const SUPPORTED=[['qris','QRIS','QRIS'],['bca_va','BCA Virtual Account','VA'],['bni_va','BNI Virtual Account','VA'],['bri_va','BRI Virtual Account','VA'],['permata_va','Permata Virtual Account','VA']] as const;
export default function AdminPaymentSettingsPage(){const s=createClient();const toast=useToast();const[methods,setMethods]=useState<PaymentMethod[]>([]);const[topups,setTopups]=useState<TopupMethod[]>([]);const[loading,setLoading]=useState(true);const[form,setForm]=useState({method:'',account_number:'',account_name:'',instructions:''});const[edit,setEdit]=useState<string|null>(null);const[topForm,setTopForm]=useState({provider_method:'qris',label:'QRIS',description:'Bayar dengan aplikasi yang mendukung QRIS.',payment_type:'QRIS' as 'QRIS'|'VA',sort_order:10});
 async function load(){setLoading(true);const[{data:a},{data:b}]=await Promise.all([s.from('payment_settings').select('*').order('updated_at',{ascending:false}),s.from('topup_payment_methods').select('*').order('sort_order')]);setMethods((a||[]) as PaymentMethod[]);setTopups((b||[]) as TopupMethod[]);setLoading(false)}useEffect(()=>{load()},[]);
 async function saveManual(e:React.FormEvent){e.preventDefault();const payload={...form,is_active:true,updated_at:new Date().toISOString()};const q=edit?s.from('payment_settings').update(payload).eq('id',edit):s.from('payment_settings').insert(payload);const{error}=await q;if(error){toast.show(error.message,'error');return}toast.show(edit?'Metode diperbarui.':'Metode ditambahkan.','success');setEdit(null);setForm({method:'',account_number:'',account_name:'',instructions:''});load()}
 async function toggle(m:PaymentMethod){const{error}=await s.from('payment_settings').update({is_active:!m.is_active,updated_at:new Date().toISOString()}).eq('id',m.id);if(error)toast.show(error.message,'error');else load()}
 async function saveTop(){const{error}=await s.from('topup_payment_methods').upsert({...topForm,is_active:true,updated_at:new Date().toISOString()},{onConflict:'provider_method'});if(error){toast.show(error.message,'error');return}toast.show('Metode Top Up disimpan.','success');load()}
 async function toggleTop(m:TopupMethod){const{error}=await s.from('topup_payment_methods').update({is_active:!m.is_active,updated_at:new Date().toISOString()}).eq('provider_method',m.provider_method);if(error)toast.show(error.message,'error');else load()}
 return <div className="space-y-5">
  <div><p className="text-xs font-black uppercase tracking-widest text-app-kicker">Pembayaran</p><h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Metode Pembayaran</h1><p className="mt-1 text-sm text-app-muted">Admin dapat menambah/edit metode manual dan mengatur metode gateway Top Up yang didukung.</p></div>
  <Card>
    <CardTitle>Metode manual / informasi pembayaran</CardTitle>
    <CardDescription>Tampilkan nomor akun dan instruksi transfer di halaman pembayaran pelanggan.</CardDescription>
    <form onSubmit={saveManual} className="mt-4 grid gap-3 sm:grid-cols-2">
      <Input label="Nama metode" required placeholder="Transfer Bank Mandiri" value={form.method} onChange={e=>setForm({...form,method:e.target.value})} className="bg-app-inset"/>
      <Input label="Nomor akun" required placeholder="1234567890" value={form.account_number} onChange={e=>setForm({...form,account_number:e.target.value})} className="bg-app-inset"/>
      <Input label="Nama pemilik" required placeholder="PT AIDIL STORE" value={form.account_name} onChange={e=>setForm({...form,account_name:e.target.value})} className="bg-app-inset"/>
      <Input label="Instruksi" placeholder="Contoh: transfer sesuai nominal persis" value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})} className="bg-app-inset"/>
      <div className="flex gap-2 sm:col-span-2"><Button type="submit">{edit?'Simpan Perubahan':'Tambah Metode'}</Button>{edit&&<Button type="button" variant="outline" onClick={()=>{setEdit(null);setForm({method:'',account_number:'',account_name:'',instructions:''})}}>Batal</Button>}</div>
    </form>
    <div className="mt-4 space-y-3">{methods.map(m=><div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-inset p-4"><div><p className="font-black text-app-text">{m.method} — {m.account_number}</p><p className="mt-0.5 text-xs text-app-muted">a.n {m.account_name}</p><Badge tone={m.is_active?'success':'neutral'} className="mt-2">{m.is_active?'Aktif':'Nonaktif'}</Badge></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>{setEdit(m.id);setForm({method:m.method,account_number:m.account_number,account_name:m.account_name,instructions:m.instructions||''})}}>Edit</Button><Button size="sm" variant={m.is_active?'destructive':'secondary'} onClick={()=>toggle(m)}>{m.is_active?'Nonaktifkan':'Aktifkan'}</Button></div></div>)}</div>
  </Card>
  <Card>
    <CardTitle>Metode Top Up otomatis (Midtrans)</CardTitle>
    <CardDescription>Kode provider dibatasi ke metode yang didukung integrasi Midtrans. Admin dapat mengubah label, deskripsi, urutan, dan status.</CardDescription>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Select label="Kode provider" value={topForm.provider_method} onChange={e=>{const x=SUPPORTED.find(a=>a[0]===e.target.value)||SUPPORTED[0];setTopForm({provider_method:x[0],label:x[1],description:'',payment_type:x[2],sort_order:10})}} className="bg-app-inset">{SUPPORTED.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</Select>
      <Input label="Label" value={topForm.label} onChange={e=>setTopForm({...topForm,label:e.target.value})} placeholder="QRIS" className="bg-app-inset"/>
      <Input label="Deskripsi" value={topForm.description} onChange={e=>setTopForm({...topForm,description:e.target.value})} placeholder="Bayar dengan aplikasi yang mendukung QRIS." className="bg-app-inset"/>
      <Input label="Urutan" type="number" value={topForm.sort_order} onChange={e=>setTopForm({...topForm,sort_order:Number(e.target.value)})} className="bg-app-inset"/>
      <div className="flex items-end sm:col-span-2"><Button onClick={saveTop}>Tambah / Simpan Metode Top Up</Button></div>
    </div>
    <div className="mt-4 space-y-3">{loading?<LoadingSkeleton rows={4} />:topups.map(m=><div key={m.provider_method} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-inset p-4"><div><p className="flex flex-wrap items-center gap-2 font-black text-app-text">{m.label}<Badge tone={m.payment_type==='QRIS'?'gold':'neutral'} className="px-2 py-0.5">{m.provider_method}</Badge></p><p className="mt-0.5 text-xs text-app-muted">{m.description||'-'}</p><Badge tone={m.is_active?'success':'neutral'} className="mt-2">{m.is_active?'Aktif':'Nonaktif'}</Badge></div><Button size="sm" variant={m.is_active?'destructive':'secondary'} onClick={()=>toggleTop(m)}>{m.is_active?'Nonaktifkan':'Aktifkan'}</Button></div>)}</div>
  </Card>
 </div>}
