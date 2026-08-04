const CLASS: Record<string, string> = {
  Deal: 'badge badge-deal',
  'On-Progress': 'badge badge-progress',
  Fail: 'badge badge-fail',
  Lunas: 'badge badge-deal',
  'Belum Lunas': 'badge badge-progress',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={CLASS[status] ?? 'badge'}>{status}</span>;
}
