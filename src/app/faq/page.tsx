import {createClient} from '@/lib/supabase/server';

export default async function FAQ(){
  const s=createClient();
  const {data}=await s.from('faqs').select('id,question,answer').eq('is_active',true).order('sort_order').order('created_at');
  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-app-border bg-app-surface p-6 text-app-text shadow-sm">
      <p className="section-kicker">Bantuan</p>
      <h1 className="mt-1 text-2xl font-black text-app-text">F.A.Q</h1>
      <p className="mt-2 text-sm text-app-muted">Pertanyaan yang sering ditanyakan pelanggan.</p>
      <div className="mt-5 divide-y divide-app-border">
        {(data||[]).map(x=>(
          <details key={x.id} className="py-4">
            <summary className="cursor-pointer font-black text-app-text marker:text-app-muted">{x.question}</summary>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-app-muted">{x.answer}</p>
          </details>
        ))}
      </div>
      {!data?.length&&<p className="mt-5 text-sm text-app-muted">FAQ belum tersedia.</p>}
    </div>
  );
}
