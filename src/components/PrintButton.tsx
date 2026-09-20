"use client";
import { useState } from "react";

type Props={receiptText?:string};
const COMMON_PRINTER_SERVICES=[
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "00001101-0000-1000-8000-00805f9b34fb",
];

export default function PrintButton({receiptText="AIDIL STORE\nStruk Transaksi\n\n"}:Props){
 const[bluetooth,setBluetooth]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function connectAndPrint(){
  setMessage("");const bt=(navigator as any).bluetooth;
  if(!bt?.requestDevice){setMessage("Peramban ini belum mendukung Web Bluetooth. Gunakan Chrome/Edge pada perangkat yang mendukung Bluetooth.");return}
  setBusy(true);
  try{
   const device=await bt.requestDevice({acceptAllDevices:true,optionalServices:COMMON_PRINTER_SERVICES});
   if(!device?.gatt) throw new Error("Perangkat Bluetooth tidak mendukung koneksi GATT.");
   const server=await device.gatt.connect();
   const services=await server.getPrimaryServices();
   let writable:any=null;
   for(const service of services){
    const chars=await service.getCharacteristics();
    writable=chars.find((c:any)=>c.properties?.write||c.properties?.writeWithoutResponse);
    if(writable) break;
   }
   if(!writable) throw new Error("Tidak ditemukan kanal cetak yang dapat ditulis pada printer ini.");
   const encoder=new TextEncoder();
   const data=encoder.encode("\x1b@"+receiptText+"\n\n\n\x1dV\x00");
   const chunkSize=80;
   for(let i=0;i<data.length;i+=chunkSize){const chunk=data.slice(i,i+chunkSize);if(writable.writeValueWithoutResponse) await writable.writeValueWithoutResponse(chunk);else await writable.writeValue(chunk);}
   setBluetooth(true);setMessage(`Struk dikirim ke ${device.name||"printer Bluetooth"}.`);
  }catch(error:any){if(error?.name!=="NotFoundError")setMessage(error?.message||"Printer Bluetooth tidak dapat digunakan.")}
  finally{setBusy(false)}
 }
 return <div className="no-print mt-6 space-y-3"><div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy} onClick={connectAndPrint} className={`rounded-xl px-4 py-3 text-sm font-black ${bluetooth?"bg-gold-100 text-zinc-900":"bg-gold-700 text-white"}`}>{busy?"Menghubungkan...":bluetooth?"✓ Cetak Bluetooth Berhasil":"🖨️ Cetak via Bluetooth"}</button><button type="button" onClick={()=>window.print()} className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300">🖨️ Cetak / Simpan PDF</button></div>{message&&<p className="rounded-xl bg-gold-50 p-3 text-xs leading-5 text-zinc-950">{message}</p>}</div>;
}
