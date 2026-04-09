/**
 * NFSe (Nota Fiscal de Serviço) — Types
 * Defines NFSe Nacional (Brazilian gov API) types and local credential storage types.
 */

/**
 * NFSe Nacional API Credentials
 * Stored encrypted in IntegrationCredential.encryptedJson
 * mTLS authentication uses PFX certificate (ICP-Brasil e-CNPJ A1)
 */
export interface NfseNacionalCredentials {
  certificatePfxBase64: string; // PFX certificate in base64 (uploaded file)
  certificatePassword: string; // Password for the PFX certificate
  cnpj: string; // Service provider CNPJ (14 digits)
  inscricaoMunicipal: string; // Municipal registration number
  codigoMunicipio: string; // IBGE municipality code
  codigoTributacaoNacional?: string; // Default: "6319" (CNAE 8650-0/01 for psychology)
  ambiente: "producao" | "homologacao"; // Sandbox or production
}

/**
 * DPS (Declaração de Prestação de Serviço) — the payload sent to NFSe Nacional API
 * This is what gets submitted to issue an NFS-e
 */
export interface DpsData {
  competencia: string; // YYYYMM format (service month)
  servico: {
    descricao: string; // Service description
    codigoTributacaoNacional: string; // Service code (e.g., "6319")
    valorServicos: number; // Value in cents (will be converted to BRL)
  };
  prestador: {
    cnpj: string; // Service provider CNPJ
    inscricaoMunicipal: string;
    codigoMunicipio: string;
  };
  tomador: {
    cpf?: string; // Customer CPF (11 digits, no formatting)
    razaoSocial: string; // Customer name
    nomeFantasia?: string;
  };
}

/**
 * Response from NFSe Nacional API when issuing a DPS
 */
export interface NfseNacionalResponse {
  chaveAcesso?: string; // Access key / NFSe ID (40 digits)
  numero?: string; // NFSe number
  serie?: string; // NFSe series
  status?: string; // e.g., "ACEITO", "REJEITADO", "PROCESSANDO"
  statusDps?: string;

  // Timing
  dataEmissao?: string; // ISO timestamp
  dataAceite?: string;

  // Errors
  erros?: Array<{ codigo?: string; mensagem?: string }>;
  avisos?: Array<{ codigo?: string; mensagem?: string }>;

  [key: string]: unknown;
}

/**
 * Response from NFSe Nacional API when checking status
 */
export interface NfseStatusResponse {
  chaveAcesso?: string;
  numero?: string;
  serie?: string;
  status?: string; // e.g., "ACEITO", "PROCESSANDO", "REJEITADO", "CANCELADO"
  statusDps?: string;

  dataEmissao?: string;
  dataAceite?: string;
  dataCancelamento?: string;

  erros?: Array<{ codigo?: string; mensagem?: string }>;
  avisos?: Array<{ codigo?: string; mensagem?: string }>;

  [key: string]: unknown;
}

/**
 * Local response shape for issue/status endpoints
 */
export interface NfseApiResponse {
  success: boolean;
  externalId?: string; // NFSe chaveAcesso or number
  status?: string; // "DRAFT", "QUEUED", "PROCESSING", "ISSUED", "FAILED", "CANCELED"
  pdfUrl?: string;
  xmlUrl?: string;
  issuedAt?: string; // ISO timestamp
  error?: string; // Error message if failed
}
