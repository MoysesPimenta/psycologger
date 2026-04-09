/**
 * NFSe Nacional API Adapter
 * Handles communication with Brazilian government's standardized NFSe API.
 * Uses Node.js native https with mTLS (client certificate) authentication.
 * Certificate: ICP-Brasil e-CNPJ A1 in PFX format
 */

import https from "https";
import type {
  NfseNacionalCredentials,
  DpsData,
  NfseNacionalResponse,
  NfseStatusResponse,
  NfseApiResponse,
} from "./types";

const TAG = "[nfse-nacional]";

// Base URLs for NFSe Nacional
const BASE_URLS = {
  producao: "https://sefin.nfse.gov.br/sefinnacional",
  homologacao: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
};

/**
 * Create an HTTPS agent with client certificate (mTLS)
 * The PFX certificate must be in the credentials and converted from base64
 */
export function createHttpsAgent(credentials: NfseNacionalCredentials): https.Agent {
  // Decode PFX from base64
  const pfxBuffer = Buffer.from(credentials.certificatePfxBase64, "base64");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentOptions: any = {
    pfx: pfxBuffer,
    passphrase: credentials.certificatePassword,
    rejectUnauthorized: true, // Verify server certificate in production
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return new https.Agent(agentOptions);
}

/**
 * Make HTTPS request to NFSe Nacional API
 * Handles mTLS authentication and error handling
 */
async function nfsNacionalRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  agent: https.Agent,
  body?: unknown,
): Promise<T> {
  const baseUrl = "https://sefin.nfse.gov.br";
  const url = new URL(path, baseUrl);

  const options = {
    method,
    agent,
    headers: {
      "Content-Type": "application/json",
    },
  };

  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const req = https.request(url, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          console.error(
            `${TAG} ${method} ${path} failed:`,
            res.statusCode,
            data,
          );
          return reject(
            new Error(
              `NFSe Nacional API error: ${res.statusCode} ${res.statusMessage}`,
            ),
          );
        }

        try {
          const parsed = JSON.parse(data) as T;
          resolve(parsed);
        } catch {
          // Some endpoints may return empty response
          if (data === "") {
            resolve({} as T);
          } else {
            reject(new Error(`Failed to parse JSON response: ${data}`));
          }
        }
      });
    });

    req.on("error", (err) => {
      console.error(`${TAG} Request error:`, err);
      reject(err);
    });

    if (bodyStr) {
      req.write(bodyStr);
    }

    req.end();
  });
}

/**
 * Issue an NFSe via NFSe Nacional API
 * Submits a DPS (Declaração de Prestação de Serviço)
 */
export async function issueNfse(
  credentials: NfseNacionalCredentials,
  dpsData: DpsData,
): Promise<NfseApiResponse> {
  try {
    const agent = createHttpsAgent(credentials);
    const baseUrl = BASE_URLS[credentials.ambiente] || BASE_URLS.producao;

    const response = await nfsNacionalRequest<NfseNacionalResponse>(
      "POST",
      `${baseUrl}/DPS`,
      agent,
      dpsData,
    );

    // Check for errors in response
    if (response.erros && response.erros.length > 0) {
      const errorMsg = response.erros
        .map((e) => e.mensagem ?? e.codigo)
        .join("; ");
      console.warn(`${TAG} Issue failed with errors:`, errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }

    return {
      success: true,
      externalId: response.chaveAcesso || response.numero,
      status: mapNfsNacionalStatus(response.status || "PROCESSANDO"),
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
 * GET /NFSe/{chaveAcesso}
 */
export async function checkStatus(
  credentials: NfseNacionalCredentials,
  chaveAcesso: string,
): Promise<NfseApiResponse> {
  try {
    const agent = createHttpsAgent(credentials);
    const baseUrl = BASE_URLS[credentials.ambiente] || BASE_URLS.producao;

    const response = await nfsNacionalRequest<NfseStatusResponse>(
      "GET",
      `${baseUrl}/NFSe/${chaveAcesso}`,
      agent,
    );

    if (response.erros && response.erros.length > 0) {
      const errorMsg = response.erros
        .map((e) => e.mensagem ?? e.codigo)
        .join("; ");
      return {
        success: false,
        error: errorMsg,
      };
    }

    return {
      success: true,
      externalId: response.chaveAcesso || response.numero,
      status: mapNfsNacionalStatus(response.status || "PROCESSANDO"),
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
 * Download the DANFSE (PDF) of an NFSe
 * GET /NFSe/danfse/{chaveAcesso}
 */
export async function downloadDanfse(
  credentials: NfseNacionalCredentials,
  chaveAcesso: string,
): Promise<Buffer | null> {
  try {
    const agent = createHttpsAgent(credentials);
    const baseUrl = BASE_URLS[credentials.ambiente] || BASE_URLS.producao;

    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}/NFSe/danfse/${chaveAcesso}`);

      const req = https.request(url, { method: "GET", agent }, (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          console.warn(`${TAG} PDF download failed:`, res.statusCode);
          return resolve(null);
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });

      req.on("error", (err) => {
        console.error(`${TAG} downloadDanfse error:`, err);
        resolve(null);
      });

      req.end();
    });
  } catch (err) {
    console.error(`${TAG} downloadDanfse failed:`, err);
    return null;
  }
}

/**
 * Download the XML of an NFSe
 * GET /NFSe/{chaveAcesso}/xml
 */
export async function downloadXml(
  credentials: NfseNacionalCredentials,
  chaveAcesso: string,
): Promise<string | null> {
  try {
    const agent = createHttpsAgent(credentials);
    const baseUrl = BASE_URLS[credentials.ambiente] || BASE_URLS.producao;

    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}/NFSe/${chaveAcesso}/xml`);

      const req = https.request(url, { method: "GET", agent }, (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          console.warn(`${TAG} XML download failed:`, res.statusCode);
          return resolve(null);
        }

        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      });

      req.on("error", (err) => {
        console.error(`${TAG} downloadXml error:`, err);
        resolve(null);
      });

      req.end();
    });
  } catch (err) {
    console.error(`${TAG} downloadXml failed:`, err);
    return null;
  }
}

/**
 * Cancel an NFSe
 * POST /Evento with action="cancel"
 */
export async function cancelNfse(
  credentials: NfseNacionalCredentials,
  chaveAcesso: string,
  motivo?: string,
): Promise<NfseApiResponse> {
  try {
    const agent = createHttpsAgent(credentials);
    const baseUrl = BASE_URLS[credentials.ambiente] || BASE_URLS.producao;

    const payload = {
      chaveAcesso,
      tipoEvento: "CancelamentoDps",
      justificativa: motivo || "Cancelamento solicitado",
    };

    const response = await nfsNacionalRequest<NfseStatusResponse>(
      "POST",
      `${baseUrl}/Evento`,
      agent,
      payload,
    );

    if (response.erros && response.erros.length > 0) {
      const errorMsg = response.erros
        .map((e) => e.mensagem ?? e.codigo)
        .join("; ");
      return {
        success: false,
        error: errorMsg,
      };
    }

    return {
      success: true,
      externalId: response.chaveAcesso || response.numero,
      status: "CANCELED",
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
 * Map NFSe Nacional status to local NfseStatus enum
 */
function mapNfsNacionalStatus(
  status: string,
): "DRAFT" | "QUEUED" | "PROCESSING" | "ISSUED" | "FAILED" | "CANCELED" {
  const normalized = status?.toUpperCase() ?? "";

  if (normalized.includes("CANCELAD")) return "CANCELED";
  if (normalized.includes("ACEITO")) return "ISSUED";
  if (normalized.includes("REJEITAD")) return "FAILED";
  if (normalized.includes("PROCESSAND") || normalized.includes("PROCESSANDO"))
    return "PROCESSING";
  if (normalized.includes("DRAFT") || normalized.includes("RASCUNHO"))
    return "DRAFT";

  // Default to PROCESSING while awaiting response
  return "PROCESSING";
}
