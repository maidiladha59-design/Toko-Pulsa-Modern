'use client';
import {useEffect,useState} from 'react';import Button from '@/components/Button';import {useToast} from '@/components/ToastProvider';

type Brand = {brand_key:string;brand_name:string;logo_url:string|null;updated_at:string|null;product_count:number};

export default function AdminBrandMedia(){
  const toast=useToast();
  const [brands,setBrands]=useState<Brand[]>([]);
  const [loading,setLoading]=useState(true);
  const [busyKey,setBusyKey]=useState<string|null>(null);
  const [query,setQuery]=useState('');

  async function load(){setLoading(true);const r=await fetch('/api/admin/brand-media');const j=await r.json();if(r.ok)setBrands(j.brands||[]);else toast.show(j.message||'Gagal memuat daftar brand','error');setLoading(false)}
  useEffect(()=>{load()},[]);

  async function uploadLogo(brand:Brand,file:File){
    setBusyKey(brand.brand_key);
    try{
      const fd=new FormData();fd.append('file',file);fd.append('folder','brand-logos');
      const up=await fetch('/api/admin/media',{method:'POST',body:fd});
      const upJson=await up.json().catch(()=>({}));
      if(!up.ok){toast.show(upJson.message||'Upload gagal. Format harus JPG/PNG/WEBP/SVG/PDF, maksimal 5MB.','error');return}
      const r=await fetch('/api/admin/brand-media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brand_key:brand.brand_key,brand_name:brand.brand_name,logo_url:upJson.url})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)toast.show(j.message||'Gagal menyimpan logo','error');
      else toast.show(`Logo ${brand.brand_name} tersimpan.`,'success');
      load();
    }catch{
      toast.show('Jaringan gagal. Periksa koneksi internet lalu coba lagi.','error');
    }
    setBusyKey(null);
  }

  async function removeLogo(brand:Brand){
    if(!confirm(`Hapus logo ${brand.brand_name}?`))return;
    setBusyKey(brand.brand_key);
    const r=await fetch('/api/admin/brand-media?brand_key='+encodeURIComponent(brand.brand_key),{method:'DELETE'});
    const j=await r.json().catch(()=>({}));
    if(r.ok){toast.show('Logo dihapus.','success');load()}else toast.show(j.message||'Gagal menghapus logo','error');
    setBusyKey(null);
  }

  const filtered=brands.filter(b=>!query.trim()||b.brand_name.toLowerCase().includes(query.trim().toLowerCase())||b.brand_key.includes(query.trim().toLowerCase()));
  const withLogo=brands.filter(b=>b.logo_url).length;

  return <div>
    <div className="mb-5">
      <p className="text-xs font-black uppercase tracking-widest text-app-kicker">PPOB</p>
      <h1 className="mt-1 text-2xl font-black">Logo Brand</h1>
      <p className="text-sm text-app-muted">Kelola logo untuk setiap brand PPOB. Logo otomatis tampil pada badge kelompok produk di katalog {withLogo>0&&<span className="font-bold text-app-text">({withLogo} brand berlogo)</span>}.</p>
    </div>

    <div className="rounded-3xl border border-app-border bg-app-surface p-4">
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari brand..." className="w-full rounded-xl border border-app-border bg-app-inset px-4 py-2.5 text-sm outline-none transition focus:border-gold-400 focus:bg-app-surface focus:ring-4 focus:ring-gold-400/20"/>
    </div>

    {loading?<p className="mt-5 text-sm text-app-muted">Memuat...</p>:filtered.length===0?<p className="mt-5 rounded-2xl border border-dashed border-gold-300 bg-app-surface p-6 text-center text-sm text-app-muted">Tidak ada brand PPOB yang cocok. Brand muncul otomatis dari SKU PPOB yang tersinkron.</p>:(
      <div className="mt-5 space-y-3">
        {filtered.map(brand=>(
          <div key={brand.brand_key} className="rounded-2xl border border-app-border bg-app-surface p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-950 text-lg">
                {brand.logo_url?(brand.logo_url.toLowerCase().endsWith('.pdf')?<a href={brand.logo_url} target="_blank" rel="noreferrer" title="Buka file PDF" className="flex h-full w-full flex-col items-center justify-center leading-none text-gold-400"><span className="text-base">📄</span><span className="mt-0.5 text-[8px] font-black">PDF</span></a>:<img src={brand.logo_url} alt={brand.brand_name} className="h-full w-full object-contain"/>):<span className="text-gold-400">🖼️</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-black">{brand.brand_name}</p>
                <p className="text-xs text-app-subtle">{brand.product_count} produk · key: <code className="rounded bg-app-inset px-1">{brand.brand_key}</code></p>
              </div>
              <div className="flex items-center gap-2">
                <label className={`cursor-pointer rounded-xl bg-zinc-950 px-3 py-2 text-xs font-black text-gold-400 hover:bg-zinc-800 ${busyKey===brand.brand_key?'pointer-events-none opacity-60':''}`}>
                  {busyKey===brand.brand_key?'Mengunggah...':brand.logo_url?'Ganti Logo':'Upload Logo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf" className="hidden" disabled={busyKey===brand.brand_key} onChange={e=>{const f=e.target.files?.[0];if(f)uploadLogo(brand,f);e.target.value=''}}/>
                </label>
                {brand.logo_url&&<Button variant="danger" disabled={busyKey===brand.brand_key} onClick={()=>removeLogo(brand)}>Hapus</Button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>;
}
