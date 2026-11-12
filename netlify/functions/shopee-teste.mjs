
import { createHash } from "node:crypto";

export default async function handler() {
  const appId = process.env.SHOPEE_APP_ID?.trim();
  const secret = process.env.SHOPEE_APP_SECRET?.trim();

  const json = (status, data) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });

  if (!appId || !secret) {
    return json(500, {
      ok: false,
      message: "App ID ou Secret nao configurado no Netlify.",
    });
  }

  try {
    const query = `{
      productOfferV2(keyword: "potes", page: 1, limit: 1) {
        nodes {
          itemId
          productName
        }
      }
    }`;

    const body = JSON.stringify({ query });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signature = createHash("sha256")
      .update(appId + timestamp + body + secret)
      .digest("hex");

    const authorization =
      `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;

    const response = await fetch(
      "https://open-api.affiliate.shopee.com.br/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
        },
        body,
        signal: AbortSignal.timeout(12000),
      }
    );

    const result = await response.json();

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
        message: "Resposta inesperada da Shopee.",
      });
    }

    return json(200, {
      ok: true,
      message: "Conexao com Shopee funcionando!",
      productsFound: products.length,
      exampleProduct: products[0]?.productName ?? null,
    });
  } catch (error) {
    return json(502, {
      ok: false,
      message: "Falha de comunicacao com Shopee.",
      errorType: error?.name || "UnknownError",
    });
  }
}

export const config = {
  path: "/api/shopee-teste",
};
