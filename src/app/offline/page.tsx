"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="text-6xl mb-6">🌐</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sem conexão</h1>
        <p className="text-gray-600 mb-6">
          Tente novamente quando estiver online.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
