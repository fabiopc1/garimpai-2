
import { getStore } from "@netlify/blobs";
import { filtrarComIA } from "./ia-filtro.mjs";

export default async function handler() {
  console.log("GARIMPAI: VALIDACAO SEM CUSTO");

  try {
    const store = getStore("garimpai-catalogo");

    const catalogo = await store.get("atual", {
      type: "json"
    });

    const produtos = catalogo?.products || [];

    console.log("Produtos disponiveis:", produtos.length);

    if (!produtos.length) {
      console.log("Catalogo vazio.");
      return;
    }

    const resultado = await filtrarComIA(
      produtos.slice(0, 20),
      { permitirCobranca: false }
    );

    console.log("Resultado:", JSON.stringify(resultado));
    console.log(
      "Nenhuma chamada paga foi autorizada."
    );
    console.log("Catalogo original preservado.");

  } catch (error) {
    console.error("Erro:", error.message);
  }
}

export const config = {
  schedule: "0 0 1 1 *"
};
