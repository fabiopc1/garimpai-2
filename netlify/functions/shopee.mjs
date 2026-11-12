
import { createHash } from "node:crypto";
import { pick } from "./logic.mjs";

const ENDPOINT =
  "https://open-api.affiliate.shopee.com.br/graphql";

// Buscas iniciais - podemos ampliar depois.
const KEYWORDS = [
  "organizador cozinha",
  "utensilios domesticos",
  "limpeza",
  "ferramentas",
  "decoracao"
];

// Classificacao com prioridade para termos especificos.
function categoriaDoProduto(nome) {
  const t = String(nome).toLowerCase();

  if (/saco de lixo|lixeira|esponja|detergente|limpeza|desinfetante|pano de chao|microfibra|vassoura|rodo/.test(t)) {
    return "Limpeza e Descartáveis";
  }

  if (/lavanderia|varal|cesto de roupa|sabao para roupa|pregador|passadeira/.test(t)) {
    return "Lavanderia";
  }

  if (/furadeira|parafusadeira|broca|serra|alicate|chave de fenda|martelo|lixadeira|esmerilhadeira/.test(t)) {
    return "Ferramentas";
  }

  if (/cimento|argamassa|rejunte|tijolo|bloco de concreto|massa corrida|impermeabilizante/.test(t)) {
    return "Construção e Reforma";
  }

  if (/torneira|chuveiro|registro|sifao|ralo|ducha|valvula hidraulica/.test(t)) {
    return "Banheiro e Hidráulica";
  }

  if (/lampada|luminaria|refletor|fita led|interruptor|tomada|pendente/.test(t)) {
    return "Iluminação e Elétrica";
  }

  if (/camera wifi|fechadura digital|sensor inteligente|tomada inteligente|automacao residencial/.test(t)) {
    return "Casa Inteligente";
  }

  if (/vaso decorativo|almofada|quadro decorativo|tapete|cortina|decoracao/.test(t)) {
    return "Decoração";
  }

  if (/jardim|mangueira|rega|vaso de planta|poda|grama/.test(t)) {
    return "Jardim e Área Externa";
  }

  if (/organizador|organizadora|prateleira|estante|sapateira|gaveta|cabide|caixa organizadora/.test(t)) {
    return "Organização";
  }

  if (/pote|marmita|panela|talher|escorredor|frigideira|cozinha|copo|prato|garrafa termica/.test(t)) {
    return "Cozinha e Utensílios";
  }

  return "Utilidades Domésticas";
}

async function consultarShopee(argumentos, limite = 20) {
  const appId = process.env.SHOPEE_APP_ID?.trim();
  const secret = process.env.SHOPEE_APP_SECRET?.trim();

  if (!appId || !secret) {
    throw new Error("Credenciais Shopee ausentes");
  }

  const query = `{
    productOfferV2(
      ${argumentos}
      limit: ${limite}
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
  const timestamp = String(Math.floor(Date.now() / 1000));

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

  const result = await response.json();

  if (result.errors?.length) {
    const error = result.errors[0];
    const code = error.extensions?.code ?? "desconhecido";
    throw new Error(`Shopee API: ${code}`);
  }

  const nodes = result.data?.productOfferV2?.nodes;

  if (!Array.isArray(nodes)) {
    throw new Error("Resposta de produtos invalida");
  }

  return nodes;
}

function normalizarProdutos(produtos) {
  const aprovados = [];

  for (const produto of produtos) {
    const normalized = pick({
      ...produto,
      id: `shopee-${produto.shopId}-${produto.itemId}`
    }, "Shopee");

    if (!normalized) continue;

    normalized.categoria =
      categoriaDoProduto(produto.productName);

    aprovados.push(normalized);
  }

  return aprovados;
}

export async function downloadShopee() {
  const candidates = [];
  const warnings = [];
  let received = 0;
  let successfulQueries = 0;

  // Pesquisa por temas.
  for (const keyword of KEYWORDS) {
    try {
      const argumento =
        `keyword: ${JSON.stringify(keyword)}, page: 1,`;

      const products = await consultarShopee(argumento, 20);

      received += products.length;
      successfulQueries++;

      candidates.push(...normalizarProdutos(products));

      console.log(
        `Shopee ${keyword}: ${products.length} recebidos`
      );
    } catch (error) {
      console.error(
        `Shopee busca ${keyword}: ${error.message}`
      );

      warnings.push(
        `Falha na pesquisa Shopee: ${keyword}`
      );
    }
  }

  // Busca geral adicional: usa a consulta que ja
  // funcionou no teste, sem palavra-chave.
  for (const page of [1, 2]) {
    try {
      const argumento =
        `listType: 0, sortType: 1, page: ${page},`;

      const products = await consultarShopee(argumento, 20);

      received += products.length;
      successfulQueries++;

      candidates.push(...normalizarProdutos(products));

      console.log(
        `Shopee geral pagina ${page}: ${products.length} recebidos`
      );
    } catch (error) {
      console.error(
        `Shopee geral pagina ${page}: ${error.message}`
      );

      warnings.push(
        `Falha na busca geral Shopee - pagina ${page}`
      );
    }
  }

  if (successfulQueries === 0) {
    throw new Error("Todas as consultas Shopee falharam");
  }

  // Remove produtos repetidos.
  const unique = [
    ...new Map(
      candidates.map(product => [product.id, product])
    ).values()
  ];

  console.log(
    `Shopee: ${received} recebidos; ${unique.length} elegiveis`
  );

  return {
    received,
    candidates: unique,
    warnings
  };
}
