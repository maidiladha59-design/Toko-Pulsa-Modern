import type { ReactNode } from "react";

// Kartu standar Design System AIDIL STORE: rounded-3xl + padding p-5,
// token tema app-* supaya ikut mode terang/gelap.
// Pemakaian:
//   <Card>
//     <CardHeader>
//       <CardTitle>Judul Kartu</CardTitle>
//       <CardDescription>Keterangan singkat</CardDescription>
//     </CardHeader>
//     <CardBody>...isi...</CardBody>
//     <CardFooter>...aksi...</CardFooter>
//   </Card>
// Semua bagian opsional. Untuk kartu besar (pembayaran/hero) beri className="p-6 sm:p-8".

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-3xl border border-app-border bg-app-surface p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

export function CardTitle({ className = "", children }: { className?: string; children: ReactNode }) {
  return <h3 className={`text-base font-black text-app-text ${className}`}>{children}</h3>;
}

export function CardDescription({ className = "", children }: { className?: string; children: ReactNode }) {
  return <p className={`mt-1 text-sm text-app-muted ${className}`}>{children}</p>;
}

export function CardBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`mt-4 flex items-center gap-2 border-t border-app-border pt-4 ${className}`}>
      {children}
    </div>
  );
}
