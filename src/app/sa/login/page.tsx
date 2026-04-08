"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SALoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await signIn("email", {
        email,
        redirect: false,
        callbackUrl: "/sa/dashboard",
      });
      if (res?.error) {
        setError("Erro ao enviar link de acesso.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Erro de rede.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">SuperAdmin</h1>
          <p className="text-gray-400 text-sm mt-1">Psycologger Platform Console</p>
        </div>

        {sent ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
            <p className="text-green-400 font-medium">Link enviado!</p>
            <p className="text-gray-400 text-sm mt-2">
              Verifique seu email ({email}) para acessar o painel.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm text-gray-300">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="admin@psycologger.com"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-md px-4 py-2 text-sm transition-colors"
            >
              Enviar link de acesso
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
