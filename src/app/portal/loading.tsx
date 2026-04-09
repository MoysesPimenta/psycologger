/**
 * /portal/* loading skeleton — patient portal routes.
 * Minimal skeleton for route loading state.
 */

export default function PortalLoading() {
  return (
    <div className="min-h-screen p-6">
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
          <div className="h-4 bg-gray-100 rounded w-96 animate-pulse" />
        </div>

        {/* Cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>

        {/* Details skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
