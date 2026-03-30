# Guia do Usuário - Psycologger

**Versão 1.0** | Aplicativo de gestão clínica para psicólogos e clínicas

---

## Sumário

1. [Introdução](#introdução)
2. [Primeiros Passos](#primeiros-passos)
3. [Navegação](#navegação)
4. [Hoje — Sua Agenda do Dia](#hoje--sua-agenda-do-dia)
5. [Agenda — Planejamento Semanal e Mensal](#agenda--planejamento-semanal-e-mensal)
6. [Pacientes](#pacientes)
7. [Sessões Clínicas](#sessões-clínicas)
8. [Financeiro](#financeiro)
9. [Relatórios](#relatórios)
10. [Configurações](#configurações)
11. [Funções e Permissões](#funções-e-permissões)
12. [Perguntas Frequentes](#perguntas-frequentes)

---

## Introdução

**Psycologger** é uma plataforma de gestão clínica desenvolvida especificamente para psicólogos e clínicas de psicologia. Ela integra, em um único lugar:

- **Gestão de Pacientes** — cadastro, histórico clínico, contatos
- **Agendamento** — calendário semanal e mensal com visualização de horários
- **Registros Clínicos** — notas SOAP, BIRP ou livres, com histórico de revisões
- **Financeiro** — cobrança de sessões, rastreamento de pagamentos, controle de inadimplência
- **Relatórios** — análise de caixa vs. competência, projeção de fluxo, exportação de dados
- **Controle de Acesso** — permissões granulares por função (Administrador, Psicólogo, Assistente, Leitor)

Psycologger é ideal para:
- Psicólogos autônomos com consultório próprio
- Clínicas multidisciplinares com vários profissionais
- Assistentes administrativos que gerem agendas e financeiro

---

## Primeiros Passos

### Criar uma Conta e Fazer Login

1. Acesse o site do Psycologger
2. Clique em **"Entrar"** ou **"Criar Conta"**
3. Você tem duas opções:
   - **Email e Senha**: Crie uma conta com seus dados
   - **Magic Link**: Insira seu email e receba um link seguro para login direto

### Criar Sua Clínica (Onboarding)

Após fazer login pela primeira vez, você será levado à tela de **Onboarding**:

1. Insira o **nome da sua clínica ou consultório** (ex: "Consultório Ana Silva")
2. Clique em **"Entrar no Psycologger"**
3. Uma clínica será criada automaticamente com você como **Administrador**
4. Você será redirecionado para a tela **"Hoje"**

> **Dica:** Você pode alterar o nome da clínica depois em **Configurações > Clínica**.

### Próximos Passos Recomendados

1. **Configure sua clínica** (Configurações > Clínica)
   - Adicione endereço, telefone, horário comercial
   - Configure seu fuso horário (Brasil)
2. **Crie tipos de consulta** (Configurações > Tipos de Consulta)
   - Defina duração e preço padrão de cada tipo
3. **Convide sua equipe** (Configurações > Usuários)
   - Adicione psicólogos, assistentes, etc.
4. **Crie seus primeiros pacientes** (Pacientes > Nova Entrada)
5. **Agende suas primeiras consultas** (Agenda > Nova Consulta)

---

## Navegação

A navegação do Psycologger é simples e intuitiva. No lado esquerdo, você encontra a **barra lateral** com as seguintes seções:

### Menu Principal

| Seção | Ícone | Descrição |
|-------|-------|-----------|
| **Hoje** | Relógio | Visualize suas consultas agendadas para hoje com atalhos rápidos |
| **Agenda** | Calendário | Visualize a semana ou mês, com múltiplos profissionais |
| **Pacientes** | Pessoas | Gerencie seu banco de dados de pacientes |
| **Financeiro** | Dólar | Controle de cobranças, pagamentos e inadimplência |
| **Relatórios** | Gráfico | Dashboard mensal, caixa vs. competência, projeções |

### Menu Inferior

| Seção | Ícone | Descrição |
|-------|-------|-----------|
| **Auditoria** | Escudo | Logs de ações dos usuários (apenas Admin) |
| **Configurações** | Engrenagem | Personalize sua clínica, gerencie usuários, tipos de consulta |

### Logout

Na parte inferior da barra lateral, clique no seu avatar com sua inicial para ver o menu de perfil e sair da conta.

---

## Hoje — Sua Agenda do Dia

A página **"Hoje"** é seu painel de controle diário. Aqui você:

- Vê todas as suas consultas agendadas para hoje
- Marca consultas como realizadas, canceladas ou faltas
- Registra cobrança rápida da sessão
- Inicia o registro clínico da consulta

### Estatísticas Rápidas

Na parte superior, você vê resumos:
- **Total** — número total de consultas hoje
- **Realizadas** — quantas já foram concluídas
- **Aguardando** — quantas estão marcadas mas não realizadas
- **Faltas** — quantas foram marcadas como falta

### Cada Consulta — Ações Rápidas

Para cada consulta agendada, você verá:

**Informações da Consulta:**
- Nome do paciente (ou apelido, se configurado)
- Horário de início e fim
- Tipo de consulta (com cor de identificação)
- Local da consulta (se preenchido)
- Link para videoconferência (se aplicável)

**Status e Badges:**
- Status atual (Agendada, Confirmada, Realizada, Falta, Cancelada)
- Se já foi pago (badge verde "✓ Pago")

**Botões de Ação (para consultas pendentes):**

1. **Iniciar Sessão** — Abre o editor de notas clínicas
2. **Confirmar** — Marca como confirmada
3. **Realizada** — Marca como concluída
4. **Faltou** — Marca como falta do paciente
5. **Cancelar** — Cancela a consulta

Após marcar como **Realizada**, **Faltou** ou **Cancelada**, aparecerá automaticamente um prompt:

**"Cobrar esta sessão?"**
- Defina o valor (será pré-preenchido com o padrão)
- Defina descontos (se houver)
- Escolha a data de vencimento
- Clique em **"Criar cobrança"** ou **"Não cobrar agora"**

**Botões Adicionais:**
- **Ver cobrança** — Se há uma cobrança pendente de pagamento
- **Ver nota** — Se o registro clínico já foi feito

---

## Agenda — Planejamento Semanal e Mensal

A página **"Agenda"** permite visualizar e gerenciar suas consultas de forma visual.

### Modos de Visualização

**Modo Semana** (padrão):
- Visualiza uma semana (segunda a domingo)
- Mostra horários de 7h a 19h (default) ou 24h (alternável)
- Cada coluna é um dia
- Cada linha é uma hora

**Modo Mês**:
- Visualiza o mês inteiro
- Mostra até 2 consultas por dia
- Mostra "+X mais" se houver mais consultas

### Navegação

- **Setas (<, >)** — Navega para a semana/mês anterior ou seguinte
- **Botão "Hoje"** — Volta para o dia atual
- **Modo 24h** (apenas em vista de semana) — Alterna entre horário comercial e 24 horas

### Criar Nova Consulta

Clique em **"Nova Consulta"** (botão azul no canto superior direito). Veja a seção [Agendando Consultas](#agendando-consultas).

### Ver Detalhes de uma Consulta

Clique em qualquer consulta na agenda. Você será levado aos detalhes da consulta onde pode:
- Editar horário, paciente, tipo de consulta
- Adicionar local ou link de videoconferência
- Marcar status
- Ver cobrança associada

---

## Pacientes

A seção **"Pacientes"** é seu banco de dados centralizado de todos os atendidos.

### Listagem de Pacientes

Na página principal, você vê uma lista com:
- Avatar com inicial do nome
- Nome do paciente (e apelido entre parênteses, se houver)
- Número de consultas agendadas
- Email e telefone
- Tags (categorias personalizadas)
- Status (ativo ou arquivado)

**Filtros e Busca:**
- Digite na caixa de busca para procurar por nome, email ou telefone
- Clique em **"Ver inativos"** para mostrar/ocultar pacientes arquivados

### Criar um Novo Paciente

1. Clique em **"Novo Paciente"** ou **"+"** na página de Pacientes
2. Preencha:
   - **Nome Completo** (obrigatório)
   - **Apelido** (opcional — será exibido na agenda e "Hoje")
   - **Email** (opcional)
   - **Telefone** (opcional)
   - **Documento (CPF)** (opcional)
   - **Data de Nascimento** (opcional)
   - **Gênero** (opcional)
   - **Alergias/Informações Críticas** (opcional)
3. Clique em **"Criar Paciente"**

### Perfil do Paciente

Clique em um paciente para ver seu perfil. Aqui você encontra:

#### Abas do Perfil

**1. Visão Geral**
- Informações básicas (nome, email, telefone, documento)
- Próxima consulta agendada
- Número de consultas (total e este ano)
- Data de criação do registro

**2. Histórico de Consultas**
- Lista de todas as consultas (passadas e futuras)
- Filtre por status (Agendada, Realizada, Falta, Cancelada)
- Clique em uma consulta para ver detalhes ou agendar nova

**3. Contatos e Responsáveis**
- Adicione contatos de emergência
- Adicione responsáveis (para menores de idade)
- Mantenha múltiplos contatos por paciente

**4. Cobrança (Financeiro)**
- **Padrão de Cobrança**: Defina um valor fixo ou use o tipo de consulta padrão
- **Histórico de Cobranças**: Lista com filtros por status (Pago, Pendente, Vencido, Anulado)
- **Pagamentos Associados**: Veja cada pagamento registrado

**5. Sessões Clínicas**
- Lista de todas as notas clínicas associadas a este paciente
- Clique para ler ou editar uma nota

**6. Arquivos**
- Documentos, imagens ou files clínicos anexados
- Faça upload arrastando ou clicando
- Baixe ou exclua conforme necessário

### Editar Paciente

Na página de perfil, clique em **"Editar"** para:
- Alterar dados pessoais
- Atualizar contatos
- Modificar padrão de cobrança
- Arquivar o paciente

### Arquivar Paciente

Você pode arquivar um paciente para mantê-lo no sistema mas marcado como inativo. Isso é útil para pacientes que não mais frequentam.

Clique em **"Arquivar"** no perfil do paciente. Você pode reativar depois se necessário.

---

## Sessões Clínicas

As **"Sessões Clínicas"** são os registros de cada atendimento realizado. Psycologger oferece templates para estruturar suas notas.

### Acessar o Editor de Notas

Você pode iniciar uma nota clínica de duas formas:

1. **Direto da página "Hoje"**: Clique em **"Iniciar Sessão"** em uma consulta pendente
2. **Direto da Agenda**: Clique em uma consulta e escolha **"Iniciar Sessão"**
3. **Manual**: Vá a Pacientes > [Selecione Paciente] > Aba Sessões > **"Nova Sessão"**

### Templates de Nota

Escolha um template ao criar:

**1. SOAP (Recomendado)**
Estrutura clássica usada em psicologia clínica:
- **S — Subjetivo**: O que o paciente relatou
- **O — Objetivo**: Suas observações profissionais
- **A — Avaliação**: Sua impressão clínica
- **P — Plano**: Próximos passos, tarefas ou mudanças

**2. BIRP**
Foco comportamental (TCC/ABCC):
- **B — Comportamento**: Comportamentos observados
- **I — Intervenção**: Técnicas utilizadas
- **R — Resposta**: Resposta do paciente
- **P — Plano**: Próximos passos

**3. Livre**
Sem template — escreva como preferir

### Editando a Nota

O editor oferece:

**Formatação de Texto:**
- Negrito, itálico, sublinhado
- Listas com bullets
- Títulos e subtítulos

**Metadados:**
- **Data da Sessão**: Aparece automaticamente como data de hoje, mas pode ser alterada
- **Tipo de Template**: Mostra qual template está sendo usado

**Tags:**
- Adicione tags para categorizar (ex: "Ansiedade", "Primeira Sessão")
- Útil para filtros futuros

**Anexos (Arquivos):**
- Arraste ou clique para fazer upload de imagens, PDFs ou documentos
- Máximo de tamanho: geralmente até 25 MB por arquivo
- Tipos suportados: PDF, imagens (JPEG, PNG), documentos
- Baixe ou exclua arquivos anexados

### Salvando a Nota

A nota é **salva automaticamente** conforme você digita.

Na parte superior, você verá:
- **Salvo** — Confirmação visual de que foi salvo
- **Publicado** — Se a nota foi finalizada (diferente de salvo em rascunho)

### Histórico de Revisões

Cada alteração em uma nota clínica é registrada automaticamente.

- Acesse o **histórico de revisões** clicando em **"Ver Histórico"** ou **"Revisões"**
- Você verá cada versão com data/hora e quem fez a alteração
- Clique em uma versão anterior para **restaurá-la** (você pode escolher reverter)

> **Privacidade**: Somente usuários autorizados (o autor da nota ou Administrador, dependendo das permissões) podem ver e restaurar revisões.

### Vinculação com Consultas

Quando você cria uma nota a partir de uma consulta, ela é **automaticamente vinculada**. Na página "Hoje", você verá o botão **"Ver nota"** para consultas com registros.

---

## Financeiro

A seção **"Financeiro"** é onde você gerencia **cobranças** e **pagamentos**.

### Fluxo Financeiro

1. **Consulta realizada** → Você marca como "Realizada"
2. **Cobrança criada** → Um valor é vinculado à consulta (pode ser automático ou manual)
3. **Pagamento registrado** → Paciente paga e você marca como pago
4. **Relatório** → Vê caixa recebido, competência, inadimplência

### Visão Geral — Dashboard de Cobranças

Na página **"Financeiro"**, você vê:

**Resumo da Visualização Atual:**
- **Total de Cobranças**: Soma de todas as cobranças (com filtro aplicado)
- **Valor Recebido**: Total já pago
- **A Receber**: Valor ainda pendente
- **Vencidas**: Cobranças com data de vencimento passada

### Lista de Cobranças

Cada cobrança mostra:
- **Paciente** — Nome do paciente
- **Profissional** — Psicólogo responsável
- **Valor** — Valor bruto e desconto (se houver)
- **Status** — Pago, Pendente, Vencido, Anulado, Reembolsado
- **Data de Vencimento** — Quando é esperado o pagamento
- **Valor Pago** — Se foi pago parcialmente, mostra quanto já entrou

**Filtros:**
- Por Status (Pago, Pendente, Vencido, etc.)
- Buscar por paciente

### Marcar como Pago

**Pagamento Total:**
1. Clique em uma cobrança pendente
2. Escolha o método de pagamento (PIX, Dinheiro, Cartão, Transferência, Plano de Saúde, Outro)
3. Clique em **"Marcar como Pago"**
4. Pronto! O status muda para "Pago"

**Pagamento Parcial:**
1. Clique em uma cobrança
2. Escolha **"Registrar Pagamento Parcial"**
3. Digite o valor recebido (menor que o total)
4. Escolha o método
5. Clique em **"Registrar"**
6. A cobrança permanece com status "Parcialmente Pago"
7. Você pode registrar múltiplos pagamentos até atingir o valor total

### Criar uma Cobrança Manual

Se não criou cobrança automática no "Hoje":

1. Clique em **"Nova Cobrança"** (ou acesse via Paciente > Aba Financeiro)
2. Selecione o **Paciente**
3. Selecione o **Profissional** responsável
4. Digite o **Valor Bruto** (ex: 150,00)
5. Digite o **Desconto** (se houver)
6. Escolha a **Data de Vencimento**
7. Adicione uma **Descrição** (ex: "Consulta - Março")
8. Clique em **"Criar Cobrança"**

### Rastreamento de Inadimplência

Uma cobrança é marcada como **"Vencida"** quando:
- Status ainda é "Pendente" ou "Parcialmente Pago"
- Hoje é posterior à data de vencimento

Na página Financeiro, você pode:
- Filtrar por **"Vencidas"** para ver pendências
- Agrupar por paciente para ver quem mais deve
- Exportar relatório para cobrança externa

### Anular ou Reembolsar

Se precisa descartar uma cobrança:
1. Abra a cobrança
2. Clique em **"Anular"** ou **"Reembolsar"**
3. Informe o motivo (optional)
4. Confirme

O status muda e deixa de contar nas projeções.

---

## Relatórios

A seção **"Relatórios"** oferece análises visuais e exportação de dados para seus registros financeiros e operacionais.

### Dashboard Mensal

A visualização padrão de relatórios é um **dashboard do mês selecionado**.

**Estatísticas Principais:**
- **Valor Cobrado (Competência)** — Total cobrado no mês, independente de ter sido recebido
- **Valor Recebido (Caixa)** — Total efetivamente recebido no mês
- **Cobranças Pendentes** — Cobranças do mês que não foram pagas
- **Cobranças Vencidas** — Cobranças do mês com vencimento passado e não pagas
- **Consultas Realizadas** — Número de atendimentos concluídos
- **Novos Pacientes** — Quantos pacientes novos foram registrados

**Gráficos e Análises:**
- **Por Profissional** — Quanto cada psicólogo recebeu e tem pendente
- **Por Método de Pagamento** — Distribuição PIX, Dinheiro, Cartão, etc.
- **Estatísticas de Consultas** — Total, realizadas, canceladas, faltas

### Fluxo de Caixa (Cashflow)

Análise comparativa de **Competência vs. Caixa** ao longo dos meses.

- **Competência** — Quando a consulta foi realizada (ou cobrada)
- **Caixa** — Quando o dinheiro efetivamente entrou

Útil para:
- Entender seu fluxo de caixa real
- Identificar períodos de déficit
- Planejar para os meses seguintes

### Previsibilidade

Projeção dos próximos meses baseada em cobranças já registradas:

- **Próximos Meses** — Quanto é esperado receber (baseado em cobranças pendentes)
- **Overdue** — Quanto já deveria ter sido recebido
- **Tendência** — Se está crescendo ou reduzindo

Útil para planejamento financeiro a médio prazo.

### Exportar Dados

Clique em **"Exportar CSV"** para baixar:
- Todos as cobranças do período
- Detalhes de pagamentos
- Análise por paciente ou profissional

Abra em Excel, Google Sheets ou qualquer outro programa para análise adicional.

---

## Configurações

A seção **"Configurações"** é onde você personaliza sua clínica e gerencia usuários.

### Clínica

Acesse **Configurações > Clínica** para editar informações gerais:

**Informações Básicas:**
- **Nome da Clínica** — Alterável a qualquer momento
- **Telefone** — Para contato
- **Website** — URL do seu site (opcional)

**Endereço:**
- Rua, número, complemento
- Cidade, estado, CEP
- Aparecem em recibos e documentos formais

**Configurações de Horário:**
- **Fuso Horário** — Importante para cálculos de data/hora
- **Horário de Funcionamento** — Hora inicial e final do expediente
- **Dias Úteis** — Quais dias da semana você atende
- **Duração Padrão da Consulta** — Em minutos (ex: 50 min)

**Privacidade no Calendário:**
- **Mostrar paciente no calendário** — Ninguém, primeiro nome, ou nome completo
- Útil se o calendário é compartilhado ou projetado

**Permissões de Administradores:**
- **Administrador pode ver notas clínicas?** — Se SIM, admins acessam todas as notas
- Se NÃO, mesmo admins não veem notas (máxima privacidade)

### Tipos de Consulta

Acesse **Configurações > Tipos de Consulta** para gerenciar as categorias de atendimento.

Cada tipo de consulta tem:
- **Nome** (ex: "Psicoterapia", "Avaliação", "Retorno")
- **Duração Padrão** (em minutos)
- **Preço Padrão** (em reais)
- **Cor** — Para identificação visual na agenda

**Criar um Novo Tipo:**
1. Clique em **"Novo Tipo"**
2. Preencha nome, duração, preço e cor
3. Clique em **"Salvar"**

**Editar:**
1. Clique em um tipo existente
2. Modifique os dados
3. Clique em **"Salvar"**

**Excluir:**
- Você pode excluir se nenhuma consulta usar esse tipo
- Se houver consultas associadas, o tipo fica inativo

### Gestão de Usuários

Acesse **Configurações > Usuários** para gerenciar sua equipe.

**Listar Membros:**
- Vê todos os usuários com acesso à clínica
- Mostra nome, email, função, status (ativo/convidado), último login

**Convidar um Novo Membro:**
1. Preencha o email do novo usuário
2. Escolha a função (Psicólogo, Assistente, Administrador, Leitor)
3. Clique em **"Enviar Convite"**
4. Um email com link é enviado. O usuário clica para aceitar e criar sua conta

**Editar Função ou Suspender:**
1. Clique no usuário
2. Mude a função ou clique em **"Suspender"**
3. Clique em **"Salvar"**

> **Nota**: Você não pode deletar sua própria conta se é o único administrador. Designar outro admin primeiro.

### Perfil Pessoal

Acesse **Configurações > Perfil** para editar seus dados pessoais:
- Nome
- Email
- Senha (alterar)
- Foto de perfil (opcional)

### Lembretes

Acesse **Configurações > Lembretes** para configurar notificações automáticas:
- **Lembretes de Consultas** — Notificações antes de cada consulta (15 min, 1h, 1 dia)
- **Lembretes de Inadimplência** — Alerta cobranças vencidas
- **Lembretes de Integração** — Se você usa integrações (Google Calendar, etc.)

### Integrações

Acesse **Configurações > Integrações** para conectar ferramentas externas:

**Google Calendar:**
- Conecte sua conta Google
- Suas consultas do Psycologger sincronizam com Google Calendar

**NFe / Nota Fiscal:**
- Se você emite recibos ou notas (por lei estadual)
- Configure dados de emissão

### Exportação de Dados

Acesse **Configurações > Exportação** para baixar seus dados:
- **Backup Completo** — Todos os pacientes, consultas, cobranças
- **Relatório Financeiro** — Apenas dados financeiros
- **Auditoria** — Logs de ações dos usuários

Útil para segurança, backup ou migração.

---

## Funções e Permissões

Psycologger usa um sistema de **controle de acesso baseado em funções (RBAC)**. Cada membro da clínica tem uma função com permissões específicas.

### Funções Disponíveis

#### 1. **Administrador (TENANT_ADMIN)**

O gestor principal da clínica.

**Permissões:**
- ✓ Editar configurações da clínica
- ✓ Convidar e gerenciar usuários
- ✓ Ver todas as consultas (sem limitação de paciente)
- ✓ Ver relatórios financeiros completos
- ✓ Emitir notas fiscais
- ✓ Ver notas clínicas (dependendo de "adminCanViewClinical" em Configurações)
- ✓ Editar qualquer cobrança ou pagamento
- ✓ Exportar dados da clínica
- ✓ Ver auditoria de ações

**Quando usar:**
- Proprietário(a) da clínica
- Gerente administrativo

#### 2. **Psicólogo (PSYCHOLOGIST)**

O profissional clínico.

**Permissões:**
- ✓ Agendar próprias consultas
- ✓ Editar próprias consultas
- ✓ Criar e editar notas clínicas
- ✓ Ver histórico de revisões das próprias notas
- ✓ Registrar pagamentos de suas cobranças
- ✓ Ver relatórios de seus atendimentos
- ✓ Upload de arquivos em pacientes
- ✗ Não pode editar configurações da clínica
- ✗ Não pode convidar usuários
- ✗ Só vê pacientes atribuídos a ele (a menos que a clínica use "pool compartilhado")

**Quando usar:**
- Psicólogo(a) autônomo registrado
- Psicólogo em clínica multidisciplinar

#### 3. **Assistente (ASSISTANT)**

Suporte administrativo.

**Permissões:**
- ✓ Agendar e editar consultas
- ✓ Marcar consultas como realizada/falta/cancelada
- ✓ Criar e editar cobranças
- ✓ Registrar pagamentos
- ✓ Editar dados de pacientes
- ✓ Ver agenda e finanças
- ✗ Não pode criar notas clínicas (acesso clínico limitado)
- ✗ Não pode ver notas clínicas (a menos que tenha permissão especial)
- ✗ Não pode editar configurações

**Quando usar:**
- Recepcionista
- Assistente administrativo
- Gestor de agenda

#### 4. **Leitor (READONLY)**

Acesso de visualização apenas.

**Permissões:**
- ✓ Ver agenda
- ✓ Ver lista de pacientes
- ✓ Ver relatórios financeiros
- ✗ Não pode editar ou criar nada
- ✗ Não pode registrar pagamentos

**Quando usar:**
- Diretor que quer relatórios
- Consultor externo
- Contador (para análise fiscal)

### Permissões Especiais por Membro

Além da função, você pode conceder permissões extras a membros individuais:

- **Pode ver todos os pacientes?** — Se NÃO, só vê pacientes atribuídos
- **Pode ver notas clínicas?** — Mesmo se Assistente, pode acessar notas
- **Pode gerenciar financeiro?** — Autorização para editar cobranças/pagamentos

Configure em **Configurações > Usuários > [Clique no membro]**.

---

## Perguntas Frequentes

### Agendamento

**P: Como faço para agendar uma consulta?**
R: Acesse **Agenda > Nova Consulta** ou clique em um horário vago na visualização semanal. Preencha paciente, horário, tipo de consulta e clique em "Agendar".

**P: Posso agendar para outro psicólogo?**
R: Sim. Na nova consulta, escolha o profissional no campo "Profissional". Se você é Administrador, pode agendar para qualquer um.

**P: Como configuro lembretes de consulta para os pacientes?**
R: Atualmente, Psycologger envia lembretes por email. Configure em **Configurações > Lembretes**. Você também pode integrar com Google Calendar.

**P: Qual é a duração máxima de uma consulta?**
R: Não há limite. Configure a duração padrão em **Configurações > Clínica > Duração Padrão da Consulta**. Ao agendar, você pode ajustar a duração individual.

### Pacientes

**P: Posso importar pacientes de um arquivo Excel?**
R: Atualmente, você adiciona pacientes manualmente ou por convite. Entre em contato com suporte para importação em bulk.

**P: Como mudo o "apelido" de um paciente?**
R: Na página do paciente, clique em **Editar > Apelido** e altere. O apelido aparecerá na agenda em vez do nome completo.

**P: Um paciente pode ter múltiplos contatos de emergência?**
R: Sim! Na aba **Contatos** do paciente, clique em **"Adicionar Contato"** e repita para quantos precisar.

**P: Como arquivo um paciente?**
R: Na página do paciente, clique em **"Arquivar"**. Pacientes arquivados não aparecem por padrão, mas podem ser "desarquivados" depois.

### Notas Clínicas

**P: Posso editar uma nota depois de criada?**
R: Sim. Acesse a nota (Paciente > Sessões ou Agenda > Consulta > Ver Nota) e clique em **"Editar"**. Todas as mudanças são salvas automaticamente.

**P: Como restauro uma nota anterior?**
R: Clique em **"Ver Histórico"** na nota. Você verá todas as versões. Clique em uma versão anterior e escolha **"Restaurar"**.

**P: Quem pode ver minhas notas clínicas?**
R: Depende das configurações:
- Se a clínica permite "adminCanViewClinical", administradores veem
- Assistentes veem se tiverem permissão especial "canViewClinicalNotes"
- Psicólogos só veem suas próprias notas ou de pacientes atribuídos

**P: Posso anexar documentos nas notas?**
R: Sim. Na aba **Arquivos** da nota, arraste ou clique para upload. Tipos aceitos: PDF, imagens, documentos.

### Financeiro

**P: Qual é a diferença entre "Competência" e "Caixa"?**
R:
- **Competência** = Quando a consulta foi realizada (quando devo cobrar)
- **Caixa** = Quando o dinheiro entrou efetivamente

Exemplo: Consulta em março, recebimento em abril = Março em competência, Abril em caixa.

**P: Posso registrar um pagamento parcial?**
R: Sim. Abra a cobrança e escolha **"Registrar Pagamento Parcial"**. Digite o valor recebido. Você pode adicionar novos pagamentos até completar.

**P: Como sigo a inadimplência?**
R: Vá a **Financeiro** e filtre por **"Vencidas"**. Você vê todas as cobranças com vencimento passado e não pagas.

**P: Posso anular uma cobrança?**
R: Sim. Abra a cobrança e clique em **"Anular"** ou **"Reembolsar"**. O status muda e deixa de contar nos relatórios.

### Relatórios

**P: Por que meu "Caixa" é menor que "Competência"?**
R: Porque nem todas as cobranças foram recebidas ainda. Alguns pacientes ainda devem. Confira a aba **Financeiro > Vencidas**.

**P: Posso exportar dados para o meu contador?**
R: Sim. Vá a **Relatórios > Exportar** ou **Configurações > Exportação**. Baixe em CSV e compartilhe.

**P: Como faço uma projeção de caixa para o próximo mês?**
R: Acesse **Relatórios > Previsibilidade**. Você vê quanto é esperado receber baseado em cobranças já registradas.

### Usuários e Segurança

**P: Como convido um novo psicólogo?**
R: Vá a **Configurações > Usuários > Convidar Novo Membro**. Digite o email, escolha "Psicólogo", e clique em "Enviar Convite". Um email é enviado com link de ativação.

**P: Um psicólogo pode ver os pacientes de outro?**
R: Depende da configuração. Se a clínica usa **"Pool Compartilhado de Pacientes"**, sim. Senão, cada psicólogo só vê seus próprios. Configure em **Configurações > Clínica > Pool Compartilhado**.

**P: Como mudo a senha?**
R: Vá a **Configurações > Perfil > Alterar Senha**. Insira a senha antiga e a nova.

**P: Posso ter dois administradores?**
R: Sim. Convide outro usuário como **"Administrador"** e ambos terão permissão total.

**P: O que é "Auditoria"?**
R: É um log de todas as ações dos usuários (quem criou, editou ou deletou algo, e quando). Disponível em **Configurações > Auditoria** para administradores.

### Tecnologia e Integração

**P: Psycologger funciona no celular?**
R: Sim! O design é responsivo. Você pode acessar em smartphone ou tablet. Algumas ações (como criar notas longas) são mais fáceis em desktop.

**P: Posso integrar com Google Calendar?**
R: Sim. Vá a **Configurações > Integrações > Google Calendar** e siga as instruções.

**P: Meus dados estão seguros?**
R: Sim. Psycologger usa encriptação HTTPS, backups automáticos, e segue LGPD (Lei Geral de Proteção de Dados).

**P: Como faço backup dos meus dados?**
R: Vá a **Configurações > Exportação** e baixe um backup completo em CSV. Recomenda-se fazer backup mensal.

---

## Suporte e Contato

Se tiver dúvidas não respondidas aqui:

- **Email de Suporte**: support@psycologger.com
- **Chat de Ajuda**: Disponível na plataforma (ícone de interrogação)
- **Documentação Técnica**: docs.psycologger.com

---

**Obrigado por usar Psycologger! Esperamos que a ferramenta melhore sua prática clínica.**

*Última atualização: 2026-03*
