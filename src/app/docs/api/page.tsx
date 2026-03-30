import { readFileSync } from 'fs';
import { join } from 'path';
import { renderMarkdown } from '@/lib/markdown';

export const metadata = {
  title: 'Referência API',
  description: 'Documentação técnica da API REST do Psycologger',
};

export default function ApiPage() {
  const filePath = join(process.cwd(), 'docs', 'API.md');
  const content = readFileSync(filePath, 'utf-8');
  const rendered = renderMarkdown(content, { headingOffset: 1 });

  return (
    <article className="prose-like max-w-none">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900">Referência API - Psycologger</h1>
        <p className="text-gray-600 mt-2">
          Documentação técnica completa da API REST do Psycologger.
        </p>
      </div>

      {/* Quick Links */}
      <div className="bg-blue-50 rounded-lg p-6 mb-12 border border-blue-200">
        <h2 className="font-bold text-gray-900 mb-4">Acesso Rápido</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Base URL</h3>
            <code className="bg-gray-900 text-gray-100 px-3 py-1.5 rounded block">
              https://api.psycologger.com/api/v1
            </code>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Autenticação</h3>
            <p className="text-gray-700">
              NextAuth.js magic link via cookies
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Versionamento</h3>
            <p className="text-gray-700">
              API v1 — Estável para produção
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Ambientes</h3>
            <p className="text-gray-700">
              Production & Development
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {rendered}

      {/* Footer */}
      <div className="border-t mt-12 pt-8">
        <p className="text-sm text-gray-600">
          <strong>Nota:</strong> Esta documentação é referência técnica. Para
          exemplos práticos, consulte o repositório GitHub ou entre em contato
          com o suporte.
        </p>
      </div>
    </article>
  );
}
