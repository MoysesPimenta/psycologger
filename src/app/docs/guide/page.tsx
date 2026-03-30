import { readFileSync } from 'fs';
import { join } from 'path';
import { renderMarkdown } from '@/lib/markdown';

export const metadata = {
  title: 'Guia do Usuário',
  description: 'Guia completo de como usar o Psycologger',
};

export default function GuidePage() {
  const filePath = join(process.cwd(), 'docs', 'USER_GUIDE.md');
  const content = readFileSync(filePath, 'utf-8');
  const rendered = renderMarkdown(content, { headingOffset: 1 });

  return (
    <article className="prose-like max-w-none">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900">Guia do Usuário - Psycologger</h1>
        <p className="text-gray-600 mt-2">
          Documentação completa sobre como usar todas as funcionalidades do Psycologger.
        </p>
      </div>

      {/* Table of Contents */}
      <nav className="bg-gray-50 rounded-lg p-6 mb-12 border">
        <h2 className="font-bold text-gray-900 mb-4">Índice</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <a href="#introdução" className="text-brand-600 hover:text-brand-700">
              Introdução
            </a>
          </li>
          <li>
            <a href="#primeiros-passos" className="text-brand-600 hover:text-brand-700">
              Primeiros Passos
            </a>
          </li>
          <li>
            <a href="#navegação" className="text-brand-600 hover:text-brand-700">
              Navegação
            </a>
          </li>
          <li>
            <a href="#hoje--sua-agenda-do-dia" className="text-brand-600 hover:text-brand-700">
              Hoje
            </a>
          </li>
          <li>
            <a href="#agenda--planejamento-semanal-e-mensal" className="text-brand-600 hover:text-brand-700">
              Agenda
            </a>
          </li>
          <li>
            <a href="#pacientes" className="text-brand-600 hover:text-brand-700">
              Pacientes
            </a>
          </li>
          <li>
            <a href="#sessões-clínicas" className="text-brand-600 hover:text-brand-700">
              Sessões Clínicas
            </a>
          </li>
          <li>
            <a href="#financeiro" className="text-brand-600 hover:text-brand-700">
              Financeiro
            </a>
          </li>
          <li>
            <a href="#relatórios" className="text-brand-600 hover:text-brand-700">
              Relatórios
            </a>
          </li>
          <li>
            <a href="#configurações" className="text-brand-600 hover:text-brand-700">
              Configurações
            </a>
          </li>
          <li>
            <a href="#funções-e-permissões" className="text-brand-600 hover:text-brand-700">
              Funções e Permissões
            </a>
          </li>
          <li>
            <a href="#perguntas-frequentes" className="text-brand-600 hover:text-brand-700">
              Perguntas Frequentes
            </a>
          </li>
        </ul>
      </nav>

      {rendered}
    </article>
  );
}
