import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <ServiceWorkerRegister />
      <div className="flex h-screen bg-gray-50">
        <AppSidebar />
        {/* Main content area — offset by sidebar width on md+ */}
        <main className="flex-1 md:ml-64 overflow-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-8 pb-28 md:pb-8">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
