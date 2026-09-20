"use client";
import { useEffect, useState } from "react";
type Banner={id:string;title:string;description?:string|null;file_url:string;file_type:string;href?:string|null};
export default function HomeBannerCarousel({banners}:{banners:Banner[]}){
 const [i,setI]=useState(0);
 useEffect(()=>{if(banners.length<2)return;const t=setInterval(()=>setI(v=>(v+1)%banners.length),3000);return()=>clearInterval(t)},[banners.length]);
 if(!banners.length)return <div className="rounded-[1.75rem] bg-slate-950 p-6 text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">AIDIL STORE</p><h2 className="mt-2 text-2xl font-black">Promo & informasi</h2><p className="mt-2 text-sm text-white/60">Banner promosi akan tampil di sini.</p></div>;
 const b=banners[i]; const content=b.file_type==='pdf'?<iframe title={b.title} src={b.file_url} className="h-64 w-full bg-white sm:h-80"/>:<img src={b.file_url} alt={b.title} className="h-64 w-full object-cover sm:h-80"/>;
 return <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm"><div className="relative">{b.href?<a href={b.href}>{content}</a>:content}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 pt-14 text-white"><p className="text-lg font-black">{b.title}</p>{b.description&&<p className="mt-1 text-xs text-white/80">{b.description}</p>}</div></div><div className="flex items-center justify-center gap-1.5 p-3">{banners.map((x,n)=><button aria-label={`Banner ${n+1}`} key={x.id} onClick={()=>setI(n)} className={`h-2 rounded-full transition ${n===i?'w-7 bg-slate-950':'w-2 bg-slate-300'}`}/>)}</div></div>;
}
