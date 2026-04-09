/**
 * NFSe (Nota Fiscal de Serviço) — Types
 * Defines PlugNotas API request/response types and local credential storage types.
 */

/**
 * PlugNotas API Credentials
 * Stored encrypted in IntegrationCredential.encryptedJson
 */
export interface PlugNotasCredentials {
  apiKey: string; // PlugNotas API key
  cnpj: string; // Tenant CNPJ (service provider)
  inscricaoMunicipal: string; // Municipal registration number
  codigoMunicipio: string; // IBGE municipality code
}

/**
 * Request to issue an NFSe with PlugNotas
 */
export interface NfseIssueRequest {
  // Service details
  descricao: string; // Service description
  valorServico: number; // Service value in cents (convert to BRL for API)
  cpfTomador: string; // Customer CPF (11 digits, no formatting)

  // Optional
  nomeTomador?: string; // Customer name
  nfseSerie?: string; // NFSe series (optional, defaults to provider setting)
}

/**
 * Response from PlugNotas when issuing an NFSe
 */
export interface NfseIssueResponse {
  id?: string; // PlugNotas internal invoice ID / RPS ID
  numero?: string; // NFSe number (assigned by municipality)
  serie?: string; // NFSe series
  status?: string; // Invoice status (e.g., "ACEITO", "REJEITADO")
  statusRps?: string; // RPS status

  // URLs (set after municipal acceptance)
  linkPdf?: string;
  linkXml?: string;

  // Timing
  dataEmissao?: string; // ISO timestamp
  dataAceite?: string; // Municipal acceptance timestamp

  // Errors/warnings
  erros?: Array<{ codigo?: string; mensagem?: string }>;
  avisos?: Array<{ codigo?: string; mensagem?: string }>;

  // Raw response may contain additional fields
  [key: string]: unknown;
}

/**
 * Response from PlugNotas when checking NFSe status
 */
export interface NfseStatusResponse {
  id?: string;
  numero?: string;
  serie?: string;
  status?: string; // e.g., "ACEITO", "PROCESSANDO", "REJEITADO", "CANCELADO"
  statusRps?: string;

  linkPdf?: string;
  linkXml?: string;

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
  externalId?: string; // PlugNotas invoice ID or NFSe number
  status?: string; // "DRAFT", "QUEUED", "PROCESSING", "ISSUED", "FAILED", "CANCELED"
  pdfUrl?: string;
  xmlUrl?: string;
  issuedAt?: string; // ISO timestamp
  error?: string; // Error message if failed
}
