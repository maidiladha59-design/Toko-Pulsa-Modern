import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";

export default async function OrdersPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, total_amount, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-xl font-bold">Pesanan Saya</h1>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {orders && orders.length > 0 ? (
          <table className="w-full text-sm">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="font-medium text-brand hover:underline">
                      {o.order_number}
                    </Link>
                    <p className="text-xs text-gray-500">{formatDate(o.created_at)}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatRupiah(o.total_amount)}</td>
                  <td className="px-4 py-3 text-right"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            <EmptyState title="Belum ada pesanan" description="Pesanan yang Anda buat akan muncul di sini." />
          </div>
        )}
      </div>
    </div>
  );
}
