
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const ENDPOINT =
  "https://open-api.affiliate.shopee.com.br/graphql";

export default async function handler() {
  console.log("GARIMPAI: TESTE DE PRECO INDIVIDUAL");

  try {
    // Busca um produto real do nosso catalogo.
    const store = getStore("garimpai-catalogo");

    const catalogo = await store.get("atual", {
      type: "json"
    });

    const produtos = catalogo?.products || [];

    // Prioriza a parafusadeira Nakasaki,
    // caso ela esteja no catalogo.
    const produto =
      produtos.find(p =>
        /nakasaki/i.test(String(p.nome))
      ) ||
      produtos.find(p =>
        /^shopee-\d+-\d+$/.test(String(p.id))
      );

    if (!produto) {
      console.log("Nenhum produto Shopee encontrado");
      return new Response("Sem produto para testar");
    }

    const identificador = String(produto.id);
    const match = identificador.match(
      /^shopee-(\d+)-(\d+)$/
    );

    if (!match) {
      console.log("ID incompatível:", identificador);
      return new Response("ID incompatível");
    }

    const shopId = match[1];
    const itemId = match[2];

    console.log("PRODUTO:", produto.nome);
    console.log("PRECO NO GARIMPAI:", produto.preco);
    console.log(
      "DESCONTO NO GARIMPAI:",
      produto.descontoInformado
    );

    const appId = process.env.SHOPEE_APP_ID?.trim();
    const secret = process.env.SHOPEE_APP_SECRET?.trim();

    if (!appId || !secret) {
      throw new Error("Credenciais Shopee ausentes");
    }

    const query = `{
      productOfferV2(
        shopId: ${shopId},
        itemId: ${itemId},
        page: 1,
        limit: 5
      ) {
        nodes {
          itemId
          shopId
          productName
          priceMin
          priceMax
          priceDiscountRate
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

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization
      },
      body,
      signal: AbortSignal.timeout(15000)
    });

    console.log("SHOPEE HTTP:", response.status);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.errors?.length) {
      console.log(
        "ERROS DA API:",
        JSON.stringify(result.errors)
      );

      return new Response("Erro retornado pela Shopee");
    }

    const ofertas =
      result.data?.productOfferV2?.nodes || [];

    console.log(
      "OFERTAS ENCONTRADAS:",
      ofertas.length
    );

    for (const oferta of ofertas) {
      console.log(
        "PRECO REAL DA API:",
        JSON.stringify({
          nome: oferta.productName,
          precoMinimo: oferta.priceMin,
          precoMaximo: oferta.priceMax,
          desconto: oferta.priceDiscountRate,
          inicio: oferta.periodStartTime,
          fim: oferta.periodEndTime
        })
      );
    }

    console.log(
      "TESTE FINALIZADO. NENHUM PRECO ALTERADO."
    );

    return new Response("Consulta concluida");

  } catch (error) {
    console.error("ERRO:", error.message);
    return new Response("Teste encerrado com erro");
  }
}

export const config = {
  schedule: "0 0 1 1 *"
};
