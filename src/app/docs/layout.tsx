'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, BookOpen } from 'lucide-react';

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    {
      label: 'Documentação',
      href: '/docs',
    },
    {
      label: 'Guia do Usuário',
      href: '/docs/guide',
    },
    {
      label: 'Referência API',
      href: '/docs/api',
    },
  ];

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <div className="min-h-screen bg-white">
          {/* Top Navigation */}
          <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
            <div className="flex items-center justify-between h-16 px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
                >
                  {sidebarOpen ? (
                    <X className="h-6 w-6" />
                  ) : (
                    <Menu className="h-6 w-6" />
                  )}
                </button>
                <Link href="/docs" className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-bold text-lg hidden sm:inline">
                    Psycologger Docs
                  </span>
                </Link>
              </div>

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center gap-8">
                <Link
                  href="/docs/guide"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Guia do Usuário
                </Link>
                <Link
                  href="/docs/api"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Referência API
                </Link>
              </nav>
            </div>
          </header>

          <div className="flex">
            {/* Sidebar */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black/20 lg:hidden z-30 top-16"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            <aside
              className={`fixed lg:static w-64 h-[calc(100vh-4rem)] bg-gray-50 border-r overflow-y-auto z-30 lg:z-0 transition-transform duration-200 ease-out ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
              }`}
            >
              <nav className="p-4 space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              {/* Helpful Links */}
              <div className="p-4 border-t mt-8">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Recursos
                </p>
                <div className="space-y-2">
                  <Link
                    href="/"
                    className="block text-sm text-brand-600 hover:text-brand-700"
                  >
                    Voltar ao Site
                  </Link>
                  <Link
                    href="/login"
                    className="block text-sm text-brand-600 hover:text-brand-700"
                  >
                    Entrar na Conta
                  </Link>
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-12">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
