/**
 * /login* loading skeleton — authentication pages.
 * Minimal skeleton for login page loading state.
 */

export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Logo skeleton */}
        <div className="flex justify-center mb-8">
          <div className="h-12 w-12 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Title skeleton */}
        <div className="space-y-2 text-center">
          <div className="h-8 bg-gray-200 rounded w-48 mx-auto animate-pulse" />
          <div className="h-4 bg-gray-100 rounded w-64 mx-auto animate-pulse" />
        </div>

        {/* Form skeleton */}
        <div className="space-y-4">
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
          <div className="h-10 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Footer skeleton */}
        <div className="text-center">
          <div className="h-4 bg-gray-100 rounded w-40 mx-auto animate-pulse" />
        </div>
      </div>
    </div>
  );
}
