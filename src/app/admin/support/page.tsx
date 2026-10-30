"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import { formatDate, humanizeError } from "@/lib/utils";

type Ticket={id:string;ticket_number:string;subject:string;category:string;priority:string;status:string;order_id:string|null;created_at:string;last_message_at:string;pelanggan:{full_name:string|null;email:string}|null};
type Msg={id:string;sender_role:string;message:string;created_at:string};
const STATUS=["OPEN","IN_PROGRESS","WAITING_CUSTOMER","RESOLVED","CLOSED"];
const statusLabel:Record<string,string>={OPEN:"Open",IN_PROGRESS:"Diproses",WAITING_CUSTOMER:"Menunggu pelanggan",RESOLVED:"Selesai",CLOSED:"Ditutup"};
const ticketTone:Record<string,"success"|"danger"|"warning"|"neutral"|"gold">={OPEN:"warning",IN_PROGRESS:"gold",WAITING_CUSTOMER:"warning",RESOLVED:"success",CLOSED:"neutral"};

export default function AdminSupportPage(){const supabase=createClient();const toast=useToast();const [tickets,setTickets]=useState<Ticket[]>([]);const [selected,setSelected]=useState<Ticket|null>(null);const [messages,setMessages]=useState<Msg[]>([]);const [reply,setReply]=useState("");const [filter,setFilter]=useState("OPEN");const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
 async function load(){setLoading(true);let q=supabase.from("support_tickets").select("id,ticket_number,subject,category,priority,status,order_id,created_at,last_message_at,pelanggan:profiles!support_tickets_user_id_fkey(full_name,email)").order("last_message_at",{ascending:false});if(filter!=="ALL")q=q.eq("status",filter);const {data,error}=await q;if(error)toast.show(humanizeError(error.message),"error");setTickets((data as Ticket[])||[]);setLoading(false)}
 async function open(t:Ticket){setSelected(t);const {data,error}=await supabase.from("support_ticket_messages").select("id,sender_role,message,created_at").eq("ticket_id",t.id).order("created_at",{ascending:true});if(error)toast.show(humanizeError(error.message),"error");setMessages((data as Msg[])||[])}
 useEffect(()=>{load();/* eslint-disable-next-line react-hooks/exhaustive-deps */},[filter]);
 async function send(){if(!selected||!reply.trim())return;setSaving(true);try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Sesi admin tidak ditemukan");const {error}=await supabase.from("support_ticket_messages").insert({ticket_id:selected.id,sender_id:user.id,sender_role:"ADMIN",message:reply.trim(),is_internal:false});if(error)throw error;await supabase.rpc("touch_support_ticket",{p_ticket_id:selected.id,p_sender_role:"ADMIN",p_message:reply.trim()});setReply("");await open(selected);await load();}catch(e:any){toast.show(humanizeError(e?.message),"error")}finally{setSaving(false)}}
 async function setStatus(status:string){if(!selected)return;setSaving(true);try{const {data,error}=await supabase.rpc("set_support_ticket_status",{p_ticket_id:selected.id,p_status:status});if(error)throw error;setSelected({...(data as Ticket),pelanggan:selected.pelanggan});toast.show("Status tiket diperbarui.","success");await load();}catch(e:any){toast.show(humanizeError(e?.message),"error")}finally{setSaving(false)}}
 return (
  <div className="space-y-5 pb-10">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Customer Support</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Ticket Center</h1>
        <p className="mt-1 text-sm text-app-muted">Kelola percakapan pelanggan, status, prioritas, dan referensi order dari satu tempat.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onChange={e=>setFilter(e.target.value)} className="font-bold md:w-56">
          <option value="OPEN">Open</option>
          {STATUS.filter(s=>s!=="OPEN").map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}
          <option value="ALL">Semua</option>
        </Select>
        <Button variant="outline" onClick={load}>↻ Refresh</Button>
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card>
        {loading ? <LoadingSkeleton rows={5} /> : tickets.length===0 ? <EmptyState icon="voucher" title="Tidak ada tiket" /> : (
          <div className="space-y-2">
            {tickets.map(t=><button key={t.id} onClick={()=>open(t)} className={`w-full rounded-2xl border p-3 text-left ${selected?.id===t.id?"border-gold-300 bg-app-accent-soft":"border-app-border hover:bg-app-inset"}`}>
              <div className="flex justify-between gap-2"><b className="text-app-text">{t.ticket_number}</b><span className="rounded-full bg-app-inset px-2 py-0.5 text-xs font-bold">{t.priority}</span></div>
              <p className="mt-1 text-sm font-bold">{t.subject}</p>
              <p className="mt-1 text-xs text-app-muted">{t.pelanggan?.full_name||t.pelanggan?.email||"Pengguna"} · {t.category}</p>
              <p className="mt-1 text-xs text-app-subtle">{formatDate(t.last_message_at)}</p>
            </button>)}
          </div>
        )}
      </Card>
      <Card className="p-0">
        {!selected ? <div className="flex min-h-[560px] items-center justify-center p-8 text-center text-sm text-app-subtle">Pilih tiket untuk menangani percakapan.</div> : (
          <div className="flex min-h-[560px] flex-col">
            <div className="border-b border-app-border p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-app-kicker">{selected.ticket_number}</p>
                  <h2 className="text-xl font-black text-app-text">{selected.subject}</h2>
                  <p className="mt-1 text-xs text-app-muted">{selected.pelanggan?.full_name||selected.pelanggan?.email} · {selected.category}{selected.order_id?` · Order ${selected.order_id}`:""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={ticketTone[selected.status]??"neutral"}>{statusLabel[selected.status]||selected.status}</Badge>
                  <Select disabled={saving} value={selected.status} onChange={e=>setStatus(e.target.value)} className="bg-app-inset font-bold md:w-44">{STATUS.map(s=><option key={s}>{s}</option>)}</Select>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {messages.map(m=><div key={m.id} className={`max-w-[85%] rounded-2xl p-3 ${m.sender_role==="ADMIN"?"ml-auto bg-gold-600 text-white":"bg-app-inset text-app-text"}`}>
                <p className="whitespace-pre-wrap text-sm">{m.message}</p>
                <p className={`mt-1 text-xs ${m.sender_role==="ADMIN"?"text-gold-100":"text-app-subtle"}`}>{m.sender_role} · {formatDate(m.created_at)}</p>
              </div>)}
            </div>
            {selected.status!=="CLOSED"&&<div className="border-t border-app-border p-4">
              <textarea value={reply} onChange={e=>setReply(e.target.value)} rows={3} placeholder="Balas pelanggan..." className="w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20" />
              <Button onClick={send} className="mt-2 w-full" loading={saving}>Kirim Balasan</Button>
            </div>}
          </div>
        )}
      </Card>
    </div>
  </div>
 );}
