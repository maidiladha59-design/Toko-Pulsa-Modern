'use client';
import{useEffect,useState}from'react';import Button from'@/components/ui/Button';import{Card}from'@/components/ui/Card';import Badge from'@/components/ui/Badge';import EmptyState from'@/components/ui/EmptyState';import LoadingSkeleton from'@/components/ui/LoadingSkeleton';import{useToast}from'@/components/ToastProvider';import Icon from'@/components/icons/Icon';
export default function AdminKYC(){const toast=useToast();const[rows,setRows]=useState<any[]>([]);const[loading,setLoading]=useState(true);async function load(){setLoading(true);const r=await fetch('/api/admin/kyc');const j=await r.json();if(r.ok)setRows(j.kyc||[]);else toast.show(j.message||'Gagal memuat KYC','error');setLoading(false)}useEffect(()=>{load()},[]);async function review(user_id:string,status:'VERIFIED'|'REJECTED',rejected_stage?:'KTP'|'SELFIE'|null){let reason='',review_note='';if(status==='REJECTED'){reason=prompt('Alasan penolakan KYC:')||'';if(reason.trim().length<3)return}else review_note=prompt('Catatan pemeriksaan admin (opsional):')||'';const r=await fetch('/api/admin/kyc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id,status,reason,review_note,rejected_stage})});const j=await r.json();if(!r.ok){toast.show(j.message||'Gagal memproses KYC','error');return}toast.show(status==='VERIFIED'?'KYC diverifikasi dan notifikasi Reseller dikirim.':'KYC ditolak dan notifikasi dikirim.','success');load()}
const proofClass="inline-flex items-center rounded-xl border border-app-border bg-app-inset px-3 py-2 text-app-text transition hover:border-gold-400 hover:bg-app-accent-soft";
return (
  <div className="space-y-5">
    <div>
      <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Verifikasi</p>
      <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">KYC Pelanggan</h1>
      <p className="mt-1 text-sm text-app-muted">Periksa KTP dan selfie wajah secara manual. Target pemeriksaan yang ditampilkan ke pelanggan: 1–3 hari.</p>
    </div>
    {loading ? (
      <LoadingSkeleton rows={5} />
    ) : !rows.length ? (
      <EmptyState icon="id_card" title="Belum ada pengajuan KYC" description="Pengajuan verifikasi identitas pelanggan akan muncul di sini." />
    ) : (
      <div className="space-y-3">
        {rows.map((x) => (
          <Card key={x.user_id}>
            <div className="flex flex-wrap justify-between gap-4">
              <div className="min-w-0">
                <p className="font-black text-app-text">{x.profiles?.full_name || 'Pengguna'}</p>
                <p className="mt-1 text-xs text-app-muted">{x.profiles?.email} · {x.profiles?.phone || '-'}</p>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-app-text">
                  <Badge tone={x.status === 'VERIFIED' ? 'success' : x.status === 'REJECTED' ? 'danger' : 'warning'}>{x.status}</Badge>
                  <span className="text-app-subtle">Akun:</span>
                  <Badge tone={x.profiles?.account_type === 'RESELLER' ? 'gold' : 'neutral'}>{x.profiles?.account_type === 'RESELLER' ? 'Reseller' : 'Pelanggan'}</Badge>
                </p>
                <p className="mt-1 text-xs text-app-muted">Dikirim: {x.submitted_at ? new Date(x.submitted_at).toLocaleString('id-ID') : '-'}</p>
                <p className="mt-1 text-xs text-app-muted">NIK (baca OCR otomatis, bukan verifikasi resmi): {x.ocr_nik || 'tidak terbaca'}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                  {x.ktp_url && <a href={x.ktp_url} target="_blank" rel="noreferrer" className={proofClass}>Lihat KTP</a>}
                  {x.selfie_url && <a href={x.selfie_url} target="_blank" rel="noreferrer" className={proofClass}>Lihat Selfie</a>}
                  {x.kk_url && <a href={x.kk_url} target="_blank" rel="noreferrer" className={proofClass}>Lihat KK lama</a>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {x.status !== 'VERIFIED' && <Button onClick={() => review(x.user_id, 'VERIFIED')}><Icon name="check" size={16} />Verifikasi</Button>}
                {x.status !== 'REJECTED' && <Button variant="destructive" onClick={() => review(x.user_id, 'REJECTED', 'KTP')}>Tolak KTP saja</Button>}
                {x.status !== 'REJECTED' && <Button variant="destructive" onClick={() => review(x.user_id, 'REJECTED', 'SELFIE')}>Tolak wajah saja</Button>}
                {x.status !== 'REJECTED' && <Button variant="destructive" onClick={() => review(x.user_id, 'REJECTED', null)}>Tolak keduanya</Button>}
              </div>
            </div>
            {x.status === 'REJECTED' && x.rejected_stage && (
              <p className="mt-3 text-xs font-bold text-warning-700 dark:text-warning-400">Tahap yang ditolak: {x.rejected_stage === 'KTP' ? 'KTP saja (user tinggal ulangi Tahap 1)' : 'Verifikasi wajah saja (user tinggal ulangi Tahap 2)'}</p>
            )}
          </Card>
        ))}
      </div>
    )}
  </div>
);
}
