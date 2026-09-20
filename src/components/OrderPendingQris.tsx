"use client";

import QrisPayment from "@/components/QrisPayment";

export default function OrderPendingQris({ orderId, qrisImage, amount, expiredAt }: { orderId: string; qrisImage: string; amount: number; expiredAt: string }) {
  return <QrisPayment orderId={orderId} qrisImage={qrisImage} amount={amount} expiredAt={expiredAt} />;
}
