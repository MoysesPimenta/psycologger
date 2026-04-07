/**
 * /app/billing/cancel
 * Shown when user cancels Stripe checkout.
 */

import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg max-w-md w-full p-8 text-center">
        <div className="text-5xl mb-4">⏸️</div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Checkout Cancelado
        </h1>

        <p className="text-gray-600 mb-6">
          Você cancelou o processo de checkout. Pode tentar novamente a qualquer momento.
        </p>

        <Link
          href="/app/billing"
          className="block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
        >
          Voltar para Planos
        </Link>

        <Link
          href="/app"
          className="block px-6 py-3 text-gray-700 font-semibold border border-gray-300 rounded-lg hover:bg-gray-50 transition mt-3"
        >
          Ir para Início
        </Link>
      </div>
    </div>
  );
}
