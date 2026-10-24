import { getRatingSummary, type RatingSummary } from "@/lib/ratings";
import RatingBadgeView from "@/components/RatingBadgeView";

// Badge publik. Ringkasan bisa dioper dari Server Component yang sudah
// mengambilnya agar tidak ada RPC ganda.
export default async function RatingBadge({
  summary,
  showEmpty = false,
  className = "",
}: {
  summary?: RatingSummary;
  showEmpty?: boolean;
  className?: string;
}) {
  const data = summary ?? (await getRatingSummary());
  return <RatingBadgeView summary={data} showEmpty={showEmpty} className={className} />;
}
