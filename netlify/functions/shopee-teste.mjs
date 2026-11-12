
import { createHash } from "node:crypto";

export default async function handler() {
  const json = (status, data) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });

  const appId = process.env.SHOPEE_APP_ID?.trim();
  const secret = process.env.SHOPEE_APP_SECRET?.trim();

  if (!appId || !secret) {
    return json(500, {
      ok: false,
      message: "Credenciais da Shopee nao configuradas.",
      appIdConfigured: Boolean(appId),
      secretConfigured: Boolean(secret),
    });
  }

  try {
    // Consulta simples para testar a API
    const query = `{
      productOfferV2(
        listType: 0
        sortType: 1
        page: 1
        limit: 1
      ) {
        nodes {
          itemId
          productName
          offerLink
        }
      }
    }`;

    // Corpo exato enviado para a Shopee
    const body = JSON.stringify({ query });

    // Timestamp Unix em segundos
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Assinatura SHA256
    const signature = createHash("sha256")
      .update(appId + timestamp + body + secret)
      .digest("hex");

    const authorization =
      `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;

    // Requisicao para a API
    const response = await fetch(
      "https://open-api.affiliate.shopee.com.br/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
        },
        body,
        signal: AbortSignal.timeout(15000),
      }
    );

    const result = await response.json();

    // Erros retornados pela Shopee
    if (!response.ok || result.errors?.length) {
      return json(502, {
        ok: false,
        message: "Shopee retornou um erro.",
        httpStatus: response.status,
        errors: (result.errors || []).map((error) => ({
          message: error.message,
          code: error.extensions?.code ?? null,
        })),
      });
    }

    const products = result.data?.productOfferV2?.nodes;

    if (!Array.isArray(products)) {
      return json(502, {
        ok: false,
        message: "Resposta inesperada da API.",
        dataReceived: Boolean(result.data),
      });
    }

    // Conexao bem-sucedida
    return json(200, {
      ok: true,
      message: "Conexao com Shopee funcionando!",
      authenticatedTest: true,
      productsFound: products.length,
      exampleProduct: products[0]
        ? {
            name: products[0].productName,
            link: products[0].offerLink,
          }
        : null,
    });

  } catch (error) {
    return json(502, {
      ok: false,
      message: "Falha de comunicacao com a Shopee.",
      errorType: error?.name || "UnknownError",
    });
  }
}

export const config = {
  path: "/api/shopee-teste",
};
