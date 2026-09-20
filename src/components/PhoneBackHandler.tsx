"use client";
import {useEffect} from 'react';
import {usePathname,useRouter} from 'next/navigation';
export default function PhoneBackHandler(){const router=useRouter();const path=usePathname();useEffect(()=>{const on=()=>{if(path==='/'||path==='/login'||path==='/register')return; router.back()};history.pushState({aidil:true},'',location.href);window.addEventListener('popstate',on);return()=>window.removeEventListener('popstate',on)},[path,router]);return null}
