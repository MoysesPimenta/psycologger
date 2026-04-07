/**
 * /app/billing/success
 * Shown after successful Stripe checkout.
 */

import Link from "next/link";

export default function BillingSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg max-w-md w-full p-8 text-center">
        <div className="text-5xl mb-4">✅</div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Parabéns!
        </h1>

        <p className="text-gray-600 mb-6">
          Seu pagamento foi processado com sucesso. Sua assinatura está ativa agora.
        </p>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-green-800">
            Você pode começar a usar todos os recursos do seu novo plano imediatamente.
          </p>
        </div>

        <Link
          href="/app/billing"
          className="block px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition"
        >
          Voltar para Planos
        </Link>

        <Link
          href="/app/patients"
          className="block px-6 py-3 text-gray-700 font-semibold border border-gray-300 rounded-lg hover:bg-gray-50 transition mt-3"
        >
          Ir para Pacientes
        </Link>
      </div>
    </div>
  );
}
