/**
 * PlugNotas API Adapter
 * Handles all communication with PlugNotas API for NFSe issuance and management.
 * Uses native fetch() — no external dependencies.
 */

import type {
  PlugNotasCredentials,
  NfseIssueRequest,
  NfseIssueResponse,
  NfseStatusResponse,
  NfseApiResponse,
} from "./types";

const PLUGNOTAS_API_URL = process.env.PLUGNOTAS_API_URL ?? "https://api.plugnotas.com.br";

const TAG = "[plugnotas]";

/**
 * Fetch wrapper with error handling
 */
async function plugnnotasRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<T> {
  const url = `${PLUGNOTAS_API_URL}${path}`;

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`${TAG} ${method} ${path} failed:`, res.status, errorText);
      throw new Error(`PlugNotas API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return data as T;
  } catch (err) {
    console.error(`${TAG} Request failed:`, err);
    throw err;
  }
}

/**
 * Issue an NFSe with PlugNotas
 * POST /nfse — Accepts RPS and issues NFSe
 */
export async function issueNfse(
  credentials: PlugNotasCredentials,
  request: NfseIssueRequest,
): Promise<NfseApiResponse> {
  try {
    // Prepare the request payload for PlugNotas
    const payload = {
      cpfCnpjTomador: request.cpfTomador, // 11-digit CPF
      nomeTomador: request.nomeTomador ?? "Cliente",
      descricaoServico: request.descricao,
      valorServico: request.valorServico / 100, // Convert cents to BRL
    };

    const response = await plugnnotasRequest<NfseIssueResponse>(
      "POST",
      "/nfse",
      credentials.apiKey,
      payload,
    );

    // Check for errors in response
    if (response.erros && response.erros.length > 0) {
      const errorMsg = response.erros.map((e) => e.mensagem ?? e.codigo).join("; ");
      console.warn(`${TAG} Issue failed with PlugNotas errors:`, errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }

    return {
      success: true,
      externalId: response.numero || response.id,
      status: mapPlugNotasStatus(response.status || "PROCESSANDO"),
      pdfUrl: response.linkPdf,
      xmlUrl: response.linkXml,
      issuedAt: response.dataEmissao || response.dataAceite,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`${TAG} issueNfse failed:`, message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Check the status of an NFSe
 * GET /nfse/:id — Check status and retrieve URLs
 */
export async function checkStatus(
  credentials: PlugNotasCredentials,
  externalId: string,
): Promise<NfseApiResponse> {
  try {
    const response = await plugnnotasRequest<NfseStatusResponse>(
      "GET",
      `/nfse/${externalId}`,
      credentials.apiKey,
    );

    if (response.erros && response.erros.length > 0) {
      const errorMsg = response.erros.map((e) => e.mensagem ?? e.codigo).join("; ");
      return {
        success: false,
        error: errorMsg,
      };
    }

    return {
      success: true,
      externalId: response.numero || response.id,
      status: mapPlugNotasStatus(response.status || "PROCESSANDO"),
      pdfUrl: response.linkPdf,
      xmlUrl: response.linkXml,
      issuedAt: response.dataAceite || response.dataEmissao,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`${TAG} checkStatus failed:`, message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Download the PDF of an NFSe
 * Returns Buffer if successful, null otherwise
 */
export async function downloadPdf(pdfUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) {
      console.warn(`${TAG} PDF download failed:`, res.status);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error(`${TAG} downloadPdf failed:`, err);
    return null;
  }
}

/**
 * Download the XML of an NFSe
 * Returns string if successful, null otherwise
 */
export async function downloadXml(xmlUrl: string): Promise<string | null> {
  try {
    const res = await fetch(xmlUrl);
    if (!res.ok) {
      console.warn(`${TAG} XML download failed:`, res.status);
      return null;
    }
    return res.text();
  } catch (err) {
    console.error(`${TAG} downloadXml failed:`, err);
    return null;
  }
}

/**
 * Cancel an NFSe
 * PUT /nfse/:id/cancel
 */
export async function cancelNfse(
  credentials: PlugNotasCredentials,
  externalId: string,
  reason?: string,
): Promise<NfseApiResponse> {
  try {
    const payload: Record<string, unknown> = {};
    if (reason) {
      payload.motivo = reason;
    }

    const response = await plugnnotasRequest<NfseStatusResponse>(
      "PUT",
      `/nfse/${externalId}/cancel`,
      credentials.apiKey,
      Object.keys(payload).length > 0 ? payload : undefined,
    );

    if (response.erros && response.erros.length > 0) {
      const errorMsg = response.erros.map((e) => e.mensagem ?? e.codigo).join("; ");
      return {
        success: false,
        error: errorMsg,
      };
    }

    return {
      success: true,
      externalId: response.numero || response.id,
      status: "CANCELED",
      pdfUrl: response.linkPdf,
      xmlUrl: response.linkXml,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`${TAG} cancelNfse failed:`, message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Map PlugNotas status to local NfseStatus enum
 */
function mapPlugNotasStatus(
  plugNotasStatus: string,
): "DRAFT" | "QUEUED" | "PROCESSING" | "ISSUED" | "FAILED" | "CANCELED" {
  const normalized = plugNotasStatus?.toUpperCase() ?? "";

  if (normalized.includes("CANCELAD")) return "CANCELED";
  if (normalized.includes("ACEITO")) return "ISSUED";
  if (normalized.includes("REJEITAD")) return "FAILED";
  if (normalized.includes("PROCESSANDO") || normalized.includes("PROCESSAND")) return "PROCESSING";
  if (normalized.includes("ENPROCESO") || normalized.includes("ENTR")) return "QUEUED";

  // Default to PROCESSING while awaiting response
  return "PROCESSING";
}
