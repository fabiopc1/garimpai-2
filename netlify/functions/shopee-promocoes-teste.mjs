
import { createHash } from "node:crypto";

const ENDPOINT =
  "https://open-api.affiliate.shopee.com.br/graphql";

export default async function handler() {
  console.log("GARIMPAI: TESTE DE PROMOCOES SHOPEE");

  const appId = process.env.SHOPEE_APP_ID?.trim();
  const secret = process.env.SHOPEE_APP_SECRET?.trim();

  if (!appId || !secret) {
    console.error("Credenciais Shopee ausentes");

    return new Response(
      "Credenciais ausentes",
      { status: 200 }
    );
  }

  // Consulta somente campanhas.
  // Nao altera nenhum produto.
  const query = `{
    shopeeOfferV2(
      sortType: 1,
      page: 1,
      limit: 10
    ) {
      nodes {
        offerName
        offerType
        offerLink
        originalLink
        periodStartTime
        periodEndTime
      }
    }
  }`;

  const body = JSON.stringify({ query });
  const timestamp = String(
    Math.floor(Date.now() / 1000)
  );

  const signature = createHash("sha256")
    .update(appId + timestamp + body + secret)
    .digest("hex");

  const authorization =
    `SHA256 Credential=${appId}, ` +
    `Timestamp=${timestamp}, ` +
    `Signature=${signature}`;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization
      },
      body,
      signal: AbortSignal.timeout(15000)
    });

    console.log(
      "Shopee HTTP:",
      response.status
    );

    if (!response.ok) {
      throw new Error(
        `Shopee HTTP ${response.status}`
      );
    }

    const result = await response.json();

    if (result.errors?.length) {
      console.log(
        "ERROS DA SHOPEE:",
        JSON.stringify(result.errors)
      );

      return new Response(
        "A API retornou erros",
        { status: 200 }
      );
    }

    const ofertas =
      result.data?.shopeeOfferV2?.nodes;

    if (!Array.isArray(ofertas)) {
      console.log(
        "Resposta sem lista de campanhas"
      );

      return new Response(
        "Formato inesperado",
        { status: 200 }
      );
    }

    console.log(
      "CAMPANHAS RECEBIDAS:",
      ofertas.length
    );

    for (const [indice, oferta] of
      ofertas.entries()) {

      console.log(
        `CAMPANHA ${indice + 1}:`,
        JSON.stringify({
          nome: oferta.offerName,
          tipo: oferta.offerType,
          inicio: oferta.periodStartTime,
          fim: oferta.periodEndTime,
          temLinkAfiliado:
            Boolean(oferta.offerLink),
          temLinkOriginal:
            Boolean(oferta.originalLink)
        })
      );
    }

    console.log(
      "TESTE CONCLUIDO. Catalogo preservado."
    );

    return new Response(
      `${ofertas.length} campanhas consultadas`,
      { status: 200 }
    );

  } catch (error) {
    console.error(
      "ERRO NO TESTE:",
      error.message
    );

    return new Response(
      "Teste encerrado com erro",
      { status: 200 }
    );
  }
}

// Agendamento raro, apenas para permitir
// a execucao manual pelo painel do Netlify.
export const config = {
  schedule: "0 0 1 1 *"
};
