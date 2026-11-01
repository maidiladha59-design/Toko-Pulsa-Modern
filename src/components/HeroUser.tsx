import ProfileHeader from "@/components/profile/ProfileHeader";

// Blok pembuka hero beranda: cincin avatar sesuai status verifikasi, sapaan
// menurut waktu WIB, nama, chip verifikasi/level/ID, dan saldo. Semua data
// sudah dimuat server pada batch query beranda — komponen ini tidak menambah
// permintaan jaringan baru.
export default function HeroUser({
  name,
  avatarId,
  avatarUrl,
  kycStatus,
  balance,
  transactions,
  accountId,
  showBalance = true,
  showLevel = true,
  showAccountId = true,
}: {
  name: string;
  avatarId: string | null;
  avatarUrl: string | null;
  kycStatus: string | null;
  balance: number | null;
  transactions: number;
  accountId: string;
  /** Toggle tampilan dari Pengaturan Beranda. */
  showBalance?: boolean;
  showLevel?: boolean;
  showAccountId?: boolean;
}) {
  return (
    <ProfileHeader
      name={name}
      avatarId={avatarId}
      avatarUrl={avatarUrl}
      kycStatus={kycStatus}
      balance={balance}
      transactions={transactions}
      accountId={accountId}
      showBalance={showBalance}
      showLevel={showLevel}
      showAccountId={showAccountId}
    />
  );
}
