
import { createHash } from "node:crypto";
import { pick } from "./logic.mjs";

const ENDPOINT =
  "https://open-api.affiliate.shopee.com.br/graphql";

// Primeiros grupos de produtos do Garimpai
const BUSCAS = [
  "pote hermetico",
  "organizador cozinha",
  "saco de lixo",
  "furadeira"
];

async function consultarShopee(keyword) {
  const appId = process.env.SHOPEE_APP_ID?.trim();
  const secret = process.env.SHOPEE_APP_SECRET?.trim();

  if (!appId || !secret) {
    throw new Error("Credenciais Shopee ausentes");
  }

  const query = `{
    productOfferV2(
      keyword: ${JSON.stringify(keyword)}
      sortType: 2
      page: 1
      limit: 20
    ) {
      nodes {
        itemId
        shopId
        productName
        imageUrl
        offerLink
        priceMin
        sales
        ratingStar
        commissionRate
        priceDiscountRate
        shopName
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

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization
    },
    body,
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Shopee HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.errors?.length) {
    const code = data.errors[0]?.extensions?.code;
    throw new Error(`Shopee API: ${code ?? "erro"}`);
  }

  return data.data?.productOfferV2?.nodes ?? [];
}

export async function downloadShopee() {
  const candidates = [];
  const warnings = [];
  let received = 0;
  let successfulQueries = 0;

  for (const keyword of BUSCAS) {
    try {
      const products = await consultarShopee(keyword);

      successfulQueries++;
      received += products.length;

      for (const product of products) {
        const normalized = pick({
          ...product,
          id: `shopee-${product.shopId}-${product.itemId}`
        }, "Shopee");

        if (normalized) {
          candidates.push(normalized);
        }
      }
    } catch (error) {
      console.error(
        `Shopee (${keyword}):`,
        error.message
      );

      warnings.push(
        `Falha ao consultar Shopee: ${keyword}`
      );
    }
  }

  if (successfulQueries === 0) {
    throw new Error("Todas as buscas Shopee falharam");
  }

  return {
    received,
    candidates,
    warnings
  };
}
