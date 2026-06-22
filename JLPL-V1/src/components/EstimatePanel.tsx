interface EstimatePanelProps {
  estimatedHours: number | null
  remainingHours: number | null
  totalLoggedHours: number | null
  storyPoints: number | null
  updatedAt: string | null
}

function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return ''
  const diffMs = Date.now() - ts
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  const diffMon = Math.round(diffDay / 30)
  if (diffMon < 12) return `${diffMon} month${diffMon === 1 ? '' : 's'} ago`
  const diffYr = Math.round(diffMon / 12)
  return `${diffYr} year${diffYr === 1 ? '' : 's'} ago`
}

function HoursBar({
  label,
  segments,
  value,
}: {
  label: string
  segments: { pct: number; color: string }[]
  value: string
}) {
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span className="w-20 flex-shrink-0 text-gray-500">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden flex">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`h-full ${s.color}`}
            style={{ width: `${Math.min(100, s.pct)}%` }}
          />
        ))}
      </div>
      <span className="w-10 text-right text-gray-700 font-medium flex-shrink-0">{value}</span>
    </div>
  )
}

export default function EstimatePanel({
  estimatedHours,
  remainingHours,
  totalLoggedHours,
  storyPoints,
  updatedAt,
}: EstimatePanelProps) {
  const hasEstimate = estimatedHours !== null && estimatedHours > 0
  const hasLogged = totalLoggedHours !== null && totalLoggedHours > 0
  const hasStoryPoints = storyPoints !== null
  const hasUpdated = !!updatedAt

  if (!hasEstimate && !hasLogged && !hasStoryPoints && !hasUpdated) return null

  const spentHours = hasEstimate && remainingHours !== null
    ? Math.max(0, estimatedHours! - remainingHours)
    : 0
  const clampedRemaining = hasEstimate && remainingHours !== null
    ? Math.min(remainingHours, estimatedHours!)
    : 0

  const loggedRemainder = hasEstimate && hasLogged
    ? Math.max(0, estimatedHours! - totalLoggedHours!)
    : 0

  return (
    <div className="space-y-2">
      {hasEstimate && (
        <>
          <HoursBar
            label="Estimated"
            segments={[{ pct: 100, color: 'bg-jira-blue' }]}
            value={`${estimatedHours}h`}
          />
          <HoursBar
            label="Remaining"
            segments={[
              {
                pct: estimatedHours! > 0 ? (spentHours / estimatedHours!) * 100 : 0,
                color: 'bg-gray-300',
              },
              {
                pct: estimatedHours! > 0 ? (clampedRemaining / estimatedHours!) * 100 : 0,
                color: 'bg-jira-orange',
              },
            ]}
            value={`${remainingHours ?? 0}h`}
          />
        </>
      )}
      {hasLogged && (
        <HoursBar
          label="Total logged"
          segments={[
            {
              pct: estimatedHours && estimatedHours > 0
                ? (totalLoggedHours! / estimatedHours) * 100
                : 100,
              color: 'bg-jira-green',
            },
            {
              pct: estimatedHours && estimatedHours > 0
                ? (loggedRemainder / estimatedHours) * 100
                : 0,
              color: 'bg-gray-200',
            },
          ]}
          value={`${totalLoggedHours!.toFixed(1)}h`}
        />
      )}
      {hasStoryPoints && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Story points</span>
          <span className="font-semibold text-jira-blue">{storyPoints}</span>
        </div>
      )}
      {hasUpdated && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Updated</span>
          <span
            className="font-medium text-gray-700"
            title={new Date(updatedAt!).toLocaleString()}
          >
            {formatRelativeTime(updatedAt!)}
          </span>
        </div>
      )}
    </div>
  )
}
