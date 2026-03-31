import Link from "next/link";

export const metadata = { title: "Termos de Uso — Psycologger" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b px-6 py-4">
        <Link href="/" className="text-xl font-bold text-brand-700">Psycologger</Link>
      </nav>
      <article className="max-w-3xl mx-auto px-6 py-12 prose prose-gray">
        <h1>Termos de Uso</h1>
        <p className="text-sm text-gray-500">Última atualização: 31 de março de 2026</p>

        <h2>1. Aceitação dos Termos</h2>
        <p>
          Ao acessar e usar o Psycologger, você concorda com estes Termos de Uso.
          Se você não concordar com qualquer parte destes termos, não deve usar o serviço.
        </p>

        <h2>2. Descrição do Serviço</h2>
        <p>
          O Psycologger é uma plataforma SaaS de gestão para consultórios e clínicas de psicologia,
          oferecendo funcionalidades de agendamento, prontuário eletrônico, gestão financeira e
          comunicação com pacientes.
        </p>

        <h2>3. Responsabilidades do Usuário</h2>
        <p>O usuário é responsável por:</p>
        <ul>
          <li>Manter a confidencialidade de suas credenciais de acesso</li>
          <li>Garantir que os dados inseridos estejam corretos e atualizados</li>
          <li>Cumprir todas as regulamentações aplicáveis, incluindo o Código de Ética do CFP</li>
          <li>Obter consentimento adequado dos pacientes para armazenamento de dados</li>
        </ul>

        <h2>4. Proteção de Dados e LGPD</h2>
        <p>
          O Psycologger atua como operador de dados conforme a Lei Geral de Proteção de Dados (LGPD).
          O profissional (controlador) é responsável por obter consentimento dos pacientes e garantir
          a legalidade do tratamento de dados pessoais e sensíveis.
        </p>

        <h2>5. Disponibilidade do Serviço</h2>
        <p>
          Empenhamo-nos para manter o serviço disponível 24/7, mas não garantimos disponibilidade
          ininterrupta. Manutenções programadas serão comunicadas com antecedência.
        </p>

        <h2>6. Propriedade Intelectual</h2>
        <p>
          Todo o conteúdo, design e tecnologia do Psycologger são propriedade da plataforma.
          Os dados clínicos inseridos pelo profissional pertencem ao profissional e seus pacientes.
        </p>

        <h2>7. Limitação de Responsabilidade</h2>
        <p>
          O Psycologger é uma ferramenta de gestão e não substitui o julgamento profissional.
          Não nos responsabilizamos por decisões clínicas tomadas com base em informações do sistema.
        </p>

        <h2>8. Rescisão</h2>
        <p>
          O usuário pode encerrar sua conta a qualquer momento. Mediante solicitação, todos os dados
          serão exportados e/ou excluídos conforme a LGPD.
        </p>

        <h2>9. Alterações nos Termos</h2>
        <p>
          Reservamo-nos o direito de alterar estes termos. Alterações significativas serão comunicadas
          por email com 30 dias de antecedência.
        </p>

        <h2>10. Contato</h2>
        <p>
          Para dúvidas sobre estes termos, entre em contato pelo email{" "}
          <a href="mailto:suporte@psycologger.com">suporte@psycologger.com</a>.
        </p>
      </article>
    </div>
  );
}
