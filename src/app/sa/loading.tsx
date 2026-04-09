/**
 * /sa/* loading skeleton — super admin console routes.
 * Minimal skeleton for route loading state.
 */

export default function SALoading() {
  return (
    <div className="min-h-screen p-6 text-white">
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="space-y-2">
          <div className="h-8 bg-gray-700 rounded w-48 animate-pulse" />
          <div className="h-4 bg-gray-800 rounded w-96 animate-pulse" />
        </div>

        {/* Content skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 bg-gray-800 rounded animate-pulse" />
          ))}
        </div>

        {/* Table skeleton */}
        <div className="space-y-3">
          <div className="h-10 bg-gray-800 rounded animate-pulse" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-gray-900 rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
