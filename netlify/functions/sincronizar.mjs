
import { getStore } from "@netlify/blobs";
import { downloadAwin } from "./awin.mjs";
import { updateHistory } from "./ranking.mjs";
import {
  downloadSupplierFeed,
  publicCandidates
} from "./fornecedores.mjs";
import { downloadShopee } from "./shopee.mjs";

export default async () => {
  const now = new Date();

  const awinURL = process.env.AWIN_FEED_URL;
  const supplierURL = process.env.SUPPLIER_FEED_URL;

  const shopeeConfigured = Boolean(
    process.env.SHOPEE_APP_ID &&
    process.env.SHOPEE_APP_SECRET
  );

  if (!awinURL && !supplierURL && !shopeeConfigured) {
    return new Response("Nenhuma fonte configurada", {
      status: 200
    });
  }

  const store = getStore("garimpai-catalogo");

  try {
    let received = 0;
    const candidates = [];
    const sources = [];
    const warnings = [];

    // 1. Shopee
    if (shopeeConfigured) {
      try {
        const data = await downloadShopee();

        received += data.received;
        candidates.push(...data.candidates);
        warnings.push(...data.warnings);

        sources.push({
          nome: "Shopee",
          recebidos: data.received,
          elegiveis: data.candidates.length
        });
      } catch (error) {
        console.error("Shopee:", error.message);
        warnings.push("Falha na fonte Shopee");
      }
    }

    // 2. Awin - preservada
    if (awinURL) {
      try {
        const data = await downloadAwin(awinURL);

        received += data.received;
        candidates.push(...data.candidates);

        sources.push({
          nome: "Awin",
          recebidos: data.received,
          elegiveis: data.candidates.length
        });
      } catch (error) {
        console.error("Awin:", error.message);
        warnings.push("Falha na fonte Awin");
      }
    }

    // 3. Fornecedores - preservados
    if (supplierURL) {
      try {
        const data = await downloadSupplierFeed(
          supplierURL,
          process.env.SUPPLIER_FEED_HOSTS || ""
        );

        const eligible = publicCandidates(
          data.qualified,
          now
        );

        received += data.received;
        candidates.push(...eligible);

        sources.push({
          nome: "Fornecedores em avaliacao",
          recebidos: data.received,
          elegiveis: eligible.length
        });
      } catch (error) {
        console.error("Fornecedores:", error.message);
        warnings.push("Falha na fonte de fornecedores");
      }
    }

    if (!candidates.length) {
      console.log("Sem candidatos. Catalogo preservado.");

      return new Response(
        "Sem produtos elegiveis; catalogo anterior preservado",
        { status: 200 }
      );
    }

    // Remove duplicados
    const unique = [
      ...new Map(
        candidates.map(product => [
          `${product.origem}-${product.id}`,
          product
        ])
      ).values()
    ];

    // Prioriza melhores ofertas
    const ranked = unique
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);

    // Historico de ofertas
    const history =
      (await store.get("historico", { type: "json" })) || {};

    const updatedHistory = updateHistory(
      history,
      ranked,
      now
    );

    await store.setJSON("historico", updatedHistory);

    // Catalogo utilizado pelo site
    await store.setJSON("atual", {
      products: ranked,
      updatedAt: now.toISOString(),
      sources,
      warnings,
      configured: true
    });

    console.log(
      `Garimpai: ${ranked.length} produtos; ${received} recebidos`
    );

    return new Response(
      `Atualizado: ${ranked.length} produtos`,
      { status: 200 }
    );

  } catch (error) {
    console.error(
      "Falha na sincronizacao:",
      String(error.message).slice(0, 160)
    );

    return new Response(
      "Erro na sincronizacao",
      { status: 500 }
    );
  }
};

export const config = {
  schedule: "0 */6 * * *"
};
