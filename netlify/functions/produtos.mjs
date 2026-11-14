
import { getStore } from "@netlify/blobs";

const HORA = 60 * 60 * 1000;

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=30, s-maxage=30"
};

function resposta(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers
  });
}

function dataValida(valor) {
  const tempo = Date.parse(valor || "");
  return Number.isFinite(tempo) ? tempo : null;
}

function dinheiro(valor) {
  if (typeof valor !== "number") return null;
  if (!Number.isFinite(valor) || valor <= 0) return null;

  return Math.round(valor * 100) / 100;
}

function aplicarPromocao(produto, promocao, agora) {
  if (!promocao || typeof promocao !== "object") {
    return produto;
  }

  // A promocao precisa corresponder ao produto exato.
  if (String(promocao.id) !== String(produto.id)) {
    return produto;
  }

  const precoAtual = dinheiro(Number(produto.preco));
  const precoBase = dinheiro(promocao.precoBase);
  const precoPix = dinheiro(promocao.precoPix);

  if (
    precoAtual === null ||
    precoBase === null ||
    precoPix === null
  ) {
    return produto;
  }

  // Se o preco da Shopee mudou, precisamos
  // conferir novamente a promocao.
  if (Math.abs(precoAtual - precoBase) > 0.01) {
    return produto;
  }

  if (precoPix >= precoAtual) {
    return produto;
  }

  const verificadoEm = dataValida(
    promocao.verificadoEm
  );

  const validoAte = dataValida(
    promocao.validoAte
  );

  // Nao aceita promocao sem datas validas.
  if (
    verificadoEm === null ||
    validoAte === null ||
    verificadoEm > agora ||
    validoAte <= agora
  ) {
    return produto;
  }

  // Precos promocionais precisam ter sido
  // verificados nas ultimas 6 horas.
  if (agora - verificadoEm > 6 * HORA) {
    return produto;
  }

  if (promocao.verificado !== true) {
    return produto;
  }

  const fontesAceitas = [
    "verificacao-manual",
    "integracao-autorizada"
  ];

  if (!fontesAceitas.includes(promocao.fonte)) {
    return produto;
  }

  const condicao = String(
    promocao.condicao || ""
  ).trim();

  if (!condicao || condicao.length > 200) {
    return produto;
  }

  return {
    ...produto,

    // Mantemos o preco normal recebido
    // da Shopee em produto.preco.
    precoPix,

    precoPixVerificado: true,
    precoPixCondicao: condicao,
    precoPixVerificadoEm:
      promocao.verificadoEm,
    precoPixValidoAte:
      promocao.validoAte,

    economiaCupom: Math.round(
      (precoAtual - precoPix) * 100
    ) / 100
  };
}

export default async function handler() {
  const empty = {
    products: [],
    sources: [],
    warnings: [],
    configured: Boolean(
      process.env.SHOPEE_APP_ID ||
      process.env.AWIN_FEED_URL ||
      process.env.SUPPLIER_FEED_URL
    ),
    updatedAt: null
  };

  try {
    const store = getStore("garimpai-catalogo");

    const saved = await store.get("atual", {
      type: "json"
    });

    if (!saved) {
      return resposta({
        ...empty,
        warnings: empty.configured
          ? ["Catalogo aguardando sincronizacao."]
          : []
      });
    }

    const agora = Date.now();

    const idade = agora - Date.parse(
      saved.updatedAt
    );

    if (
      !Number.isFinite(idade) ||
      idade < 0 ||
      idade > 36 * HORA
    ) {
      return resposta({
        ...empty,
        warnings: [
          "Catalogo desativado: ultima coleta ultrapassou 36 horas."
        ]
      });
    }

    const produtos = Array.isArray(saved.products)
      ? saved.products
      : [];

    // Promocoes sao opcionais.
    // Falhas aqui nao derrubam o catalogo.
    let promocoes = [];

    try {
      const promoStore = getStore(
        "garimpai-promocoes"
      );

      const dados = await promoStore.get(
        "ativas",
        { type: "json" }
      );

      if (Array.isArray(dados?.promocoes)) {
        promocoes = dados.promocoes;
      }
    } catch (error) {
      console.warn(
        "Promocoes indisponiveis:",
        error.message
      );
    }

    const porId = new Map();

    for (const promo of promocoes) {
      if (!promo?.id) continue;

      porId.set(String(promo.id), promo);
    }

    const atualizados = produtos.map(produto => {
      return aplicarPromocao(
        produto,
        porId.get(String(produto.id)),
        agora
      );
    });

    return resposta({
      ...saved,
      products: atualizados
    });

  } catch (error) {
    console.error(
      "Falha ao ler catalogo:",
      error.message
    );

    return resposta({
      ...empty,
      warnings: [
        "Falha ao consultar armazenamento."
      ]
    }, 503);
  }
}

export const config = {
  path: "/api/produtos"
};
