"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import { formatDate } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

const ROLES = ["USER", "ADMIN", "SUPER_ADMIN"] as const;
type User = { id:string; full_name:string|null; email:string; role:string; created_at:string };
export default function AdminUsersPage(){
 const supabase=createClient(); const toast=useToast(); const [users,setUsers]=useState<User[]>([]); const [loading,setLoading]=useState(true); const [acting,setActing]=useState<string|null>(null); const [adjust,setAdjust]=useState<Record<string,string>>({});
 async function load(){setLoading(true);const {data,error}=await supabase.from("profiles").select("id, full_name, email, role, created_at").order("created_at",{ascending:false});if(error)toast.show(error.message,"error");setUsers((data as User[])||[]);setLoading(false)}
 useEffect(()=>{load();/* eslint-disable-next-line react-hooks/exhaustive-deps */},[]);
 async function adjustWallet(id:string){const amount=Number(adjust[id]);if(!Number.isInteger(amount)||amount===0){toast.show('Masukkan nominal positif untuk menambah atau negatif untuk mengurangi.','error');return;}setActing(id);try{const res=await fetch(`/api/admin/users/${id}/wallet`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount,reason:'Penyesuaian saldo oleh admin'})});const j=await res.json();if(!res.ok){toast.show(j.message||'Gagal menyesuaikan saldo.','error');return;}toast.show('Saldo berhasil disesuaikan.','success');setAdjust({...adjust,[id]:''})}catch{toast.show('Koneksi bermasalah.','error')}finally{setActing(null)}}
 async function changeRole(id:string,role:string){setActing(id);try{const res=await fetch(`/api/admin/users/${id}/role`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role})});const json=await res.json();if(!res.ok){toast.show(json.message||"Gagal mengubah role.","error");return;}toast.show(json.message,"success");await load()}catch{toast.show("Koneksi bermasalah.","error")}finally{setActing(null)}}
 return (
  <div className="animate-page-in space-y-5">
   <div className="flex flex-wrap items-end justify-between gap-3">
    <div>
     <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Akun</p>
     <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Kelola Pengguna</h1>
     <p className="mt-1 text-sm text-app-muted">Ubah role pengguna dari panel admin.</p>
    </div>
    <Button variant="outline" onClick={load}>↻ Refresh</Button>
   </div>
   {loading ? <LoadingSkeleton rows={6} /> : (
    <Card className="p-0">
     <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
       <thead><tr className="border-b border-app-border text-left text-xs font-bold uppercase tracking-widest text-app-subtle"><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Bergabung</th><th className="px-4 py-3">Saldo</th></tr></thead>
       <tbody>
        {users.map((u) => (
         <tr key={u.id} className="border-b border-app-border last:border-0">
          <td className="px-4 py-3 font-bold text-app-text">{u.full_name || "-"}</td>
          <td className="px-4 py-3 text-app-muted">{u.email}</td>
          <td className="px-4 py-3">
           <div className="flex flex-wrap items-center gap-2">
            <Badge tone={u.role === "SUPER_ADMIN" ? "gold" : u.role === "ADMIN" ? "warning" : "neutral"} className="px-2 py-0.5">{u.role}</Badge>
            <Select disabled={acting === u.id} value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="w-36 px-3 py-2 text-xs">{ROLES.map((r) => <option key={r}>{r}</option>)}</Select>
           </div>
          </td>
          <td className="px-4 py-3 text-app-muted">{formatDate(u.created_at)}</td>
          <td className="px-4 py-3">
           <div className="flex items-center gap-2">
            <Input value={adjust[u.id] || ""} onChange={(e) => setAdjust({ ...adjust, [u.id]: e.target.value })} placeholder="±nominal" className="w-28 px-3 py-2" />
            <Button size="sm" variant="secondary" disabled={acting === u.id} onClick={() => adjustWallet(u.id)}>Edit</Button>
           </div>
          </td>
         </tr>
        ))}
       </tbody>
      </table>
     </div>
    </Card>
   )}
  </div>
 );
}
