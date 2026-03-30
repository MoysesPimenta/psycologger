import Link from 'next/link';
import { BookOpen, FileText, Code2, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Documentação',
  description: 'Documentação do Psycologger - Guias e referência técnica',
};

export default function DocsHome() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">Documentação Psycologger</h1>
        <p className="text-xl text-gray-600 max-w-2xl">
          Bem-vindo à documentação do Psycologger. Aqui você encontra guias completos,
          referência da API e dicas para aproveitar ao máximo o sistema.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Guide Card */}
        <Link href="/docs/guide">
          <div className="h-full p-8 rounded-xl border hover:border-brand-600 hover:shadow-lg transition-all bg-white cursor-pointer group">
            <div className="w-12 h-12 bg-brand-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-brand-200 transition-colors">
              <BookOpen className="h-6 w-6 text-brand-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Guia do Usuário</h2>
            <p className="text-gray-600 mb-4">
              Aprenda como usar o Psycologger. Tudo sobre navegação, pacientes, agendamento,
              sessões clínicas, financeiro e configurações.
            </p>
            <div className="flex items-center text-brand-600 font-medium">
              Leia o guia
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>

        {/* API Reference Card */}
        <Link href="/docs/api">
          <div className="h-full p-8 rounded-xl border hover:border-brand-600 hover:shadow-lg transition-all bg-white cursor-pointer group">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
              <Code2 className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Referência API</h2>
            <p className="text-gray-600 mb-4">
              Documentação técnica completa da API REST do Psycologger. Inclui autenticação,
              endpoints, tipos de dados e exemplos de uso.
            </p>
            <div className="flex items-center text-blue-600 font-medium">
              Explore a API
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>
      </div>

      {/* Getting Started Section */}
      <section className="bg-brand-50 rounded-xl p-8 border border-brand-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Começar Rápido</h2>
        <div className="space-y-3 text-gray-700">
          <p>
            Se você está começando com o Psycologger, recomendamos:
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>
              <strong>Leia o Guia do Usuário</strong> para entender as funcionalidades principais
            </li>
            <li>
              <strong>Configure sua clínica</strong> em Configurações
            </li>
            <li>
              <strong>Crie seus primeiros pacientes</strong> e agende consultas
            </li>
            <li>
              <strong>Registre suas notas clínicas</strong> usando os templates SOAP
            </li>
          </ol>
        </div>
      </section>

      {/* Support Section */}
      <section className="bg-gray-50 rounded-xl p-8 border">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Precisa de Ajuda?</h2>
        <div className="space-y-3 text-gray-700">
          <p>Se você tiver dúvidas não respondidas aqui:</p>
          <ul className="space-y-2">
            <li>
              <strong>Email de Suporte:</strong>{' '}
              <a href="mailto:support@psycologger.com" className="text-brand-600 hover:text-brand-700">
                support@psycologger.com
              </a>
            </li>
            <li>
              <strong>Chat de Ajuda:</strong> Disponível na plataforma (ícone de interrogação)
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
