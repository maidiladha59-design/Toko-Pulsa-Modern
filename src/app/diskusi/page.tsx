import type { Metadata } from "next";
import CommunityChatRoom from "./CommunityChatRoom";

export const metadata: Metadata = {
  title: "Ruang Diskusi",
  description: "Ruang diskusi publik AIDIL STORE untuk semua pengguna terdaftar.",
};

export default function DiskusiPage() {
  return <CommunityChatRoom />;
}
