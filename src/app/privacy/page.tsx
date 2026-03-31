import Link from "next/link";

export const metadata = { title: "Política de Privacidade — Psycologger" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b px-6 py-4">
        <Link href="/" className="text-xl font-bold text-brand-700">Psycologger</Link>
      </nav>
      <article className="max-w-3xl mx-auto px-6 py-12 prose prose-gray">
        <h1>Política de Privacidade</h1>
        <p className="text-sm text-gray-500">Última atualização: 31 de março de 2026</p>

        <h2>1. Introdução</h2>
        <p>
          Esta Política de Privacidade descreve como o Psycologger coleta, usa, armazena e protege
          dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
        </p>

        <h2>2. Dados Coletados</h2>
        <p>Coletamos os seguintes tipos de dados:</p>
        <ul>
          <li><strong>Dados do profissional:</strong> nome, email, telefone, dados de pagamento</li>
          <li><strong>Dados de pacientes:</strong> nome, contato, data de nascimento, CPF (quando fornecido pelo profissional)</li>
          <li><strong>Dados clínicos:</strong> notas de sessão, prontuário eletrônico (dados sensíveis conforme LGPD)</li>
          <li><strong>Dados financeiros:</strong> cobranças, pagamentos, notas fiscais</li>
          <li><strong>Dados de uso:</strong> logs de acesso, ações no sistema (para auditoria e segurança)</li>
        </ul>

        <h2>3. Base Legal</h2>
        <p>O tratamento de dados pessoais é realizado com base em:</p>
        <ul>
          <li>Consentimento do titular (dados clínicos sensíveis)</li>
          <li>Execução de contrato (dados do profissional)</li>
          <li>Cumprimento de obrigação legal (retenção fiscal e regulatória)</li>
          <li>Legítimo interesse (segurança e melhoria do serviço)</li>
        </ul>

        <h2>4. Segurança dos Dados</h2>
        <p>Implementamos medidas técnicas e organizacionais para proteger seus dados:</p>
        <ul>
          <li>Criptografia em trânsito (TLS/HTTPS) e em repouso</li>
          <li>Isolamento multi-tenant (cada clínica acessa apenas seus dados)</li>
          <li>Controle de acesso baseado em papéis (RBAC)</li>
          <li>Log de auditoria de todas as ações sensíveis</li>
          <li>Backups regulares com retenção segura</li>
        </ul>

        <h2>5. Compartilhamento de Dados</h2>
        <p>
          Não vendemos, alugamos ou compartilhamos dados pessoais com terceiros para fins de marketing.
          Dados podem ser compartilhados apenas com:
        </p>
        <ul>
          <li>Provedores de infraestrutura (Vercel, Supabase) sob contratos de processamento de dados</li>
          <li>Serviços de email transacional (Resend) para comunicação operacional</li>
          <li>Autoridades competentes quando exigido por lei</li>
        </ul>

        <h2>6. Retenção de Dados</h2>
        <p>
          Dados são retidos enquanto a conta estiver ativa. Dados clínicos excluídos são mantidos
          por 30 dias para recuperação, após os quais são permanentemente removidos.
          O profissional pode solicitar exportação ou exclusão completa a qualquer momento.
        </p>

        <h2>7. Direitos do Titular</h2>
        <p>Conforme a LGPD, você tem direito a:</p>
        <ul>
          <li>Acessar seus dados pessoais</li>
          <li>Corrigir dados incompletos ou desatualizados</li>
          <li>Solicitar eliminação de dados desnecessários</li>
          <li>Revogar consentimento</li>
          <li>Solicitar portabilidade dos dados</li>
        </ul>

        <h2>8. Cookies</h2>
        <p>
          Utilizamos apenas cookies essenciais para autenticação e funcionamento do serviço.
          Não utilizamos cookies de rastreamento ou publicidade.
        </p>

        <h2>9. Contato do Encarregado (DPO)</h2>
        <p>
          Para exercer seus direitos ou tirar dúvidas sobre esta política, entre em contato:{" "}
          <a href="mailto:privacidade@psycologger.com">privacidade@psycologger.com</a>
        </p>
      </article>
    </div>
  );
}
