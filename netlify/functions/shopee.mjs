
import { createHash } from "node:crypto";
import { pick } from "./logic.mjs";

const ENDPOINT =
  "https://open-api.affiliate.shopee.com.br/graphql";

// Categorias exibidas pelo Garimpai
const CATEGORIAS = [
  {
    nome: "Limpeza",
    regex: /\b(saco de lixo|sacos de lixo|lixeira|esponja|vassoura|rodo|limpeza|desinfetante|detergente|pano de chao|pano multiuso|microfibra|escova sanitaria)\b/
  },
  {
    nome: "Lavanderia",
    regex: /\b(lavanderia|varal|cesto de roupa|pregador de roupa|sabao em po|sabao liquido|amaciante|passadeira)\b/
  },
  {
    nome: "Ferramentas",
    regex: /\b(furadeira|parafusadeira|broca|brocas|alicate|martelo|lixadeira|esmerilhadeira|chave de fenda|chave philips|chave catraca|soquete|serra circular|trena|nivel laser|ferramentas|jogo de chaves)\b/
  },
  {
    nome: "Pintura",
    regex: /\b(tinta acrilica|tinta latex|rolo de pintura|pincel de pintura|bandeja de pintura|massa corrida|selador de parede|fita crepe|impermeabilizante|verniz para madeira)\b/
  },
  {
    nome: "Casa inteligente",
    regex: /\b(camera de seguranca|camera ip|camera wifi|fechadura digital|sensor de presenca|sensor de movimento|tomada inteligente|interruptor inteligente|lampada inteligente|automacao residencial|video porteiro)\b/
  },
  {
    nome: "Potes e cozinha",
    regex: /\b(pote|potes|marmita|marmitas|panela|frigideira|talher|talheres|escorredor de louca|escorredor de pratos|porta tempero|utensilios de cozinha|porta mantimento|mantimentos|forma de bolo|assadeira|tupperware|organizador de cozinha)\b/
  },
  {
    nome: "Decoração",
    regex: /\b(almofada|cortina|tapete|quadro decorativo|vaso decorativo|papel de parede|espelho decorativo|luminaria decorativa|pendente decorativo|abajur|decoracao de casa)\b/
  },
  {
    nome: "Utilidades",
    regex: /\b(organizador|organizadora|organizadores|prateleira|estante|sapateira|cabide|caixa organizadora|cesto organizador|torneira|chuveiro|sifao|ralo|registro hidraulico|filtro de agua|suporte de parede|parafuso|bucha|argamassa|rejunte|cimento|jardim|mangueira de jardim|regador|lampada led|refletor led)\b/
  }
];

// Produtos fora do posicionamento da loja.
// A lista tem prioridade sobre as categorias.
const EXCLUIR =
  /\b(creatina|whey|suplemento alimentar|pre treino|hipercalorico|vitamina em capsulas|fone de ouvido|headphone|headset|earbuds|airpods|smartphone|iphone|celular|tablet|smartwatch|videogame|console|controle gamer|mouse gamer|teclado gamer|vestido|legging|sutia|calcinha|cueca|camiseta|tenis esportivo|maquina de cortar cabelo|cortador de cabelo|barbeador|maquiagem|batom|perfume|bolsa feminina|relogio de pulso|pecas automotivas|acessorios automotivos|reparo de carros)\b/;

function normalizarTexto(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function classificarProduto(nome) {
  const texto = normalizarTexto(nome);

  if (!texto || EXCLUIR.test(texto)) {
    return null;
  }

  for (const categoria of CATEGORIAS) {
    if (categoria.regex.test(texto)) {
      return categoria.nome;
    }
  }

  // Produto sem relacao clara com casa:
  // nao entra no catalogo.
  return null;
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
    const code =
      result.errors[0]?.extensions?.code ?? "desconhecido";

    throw new Error(`Shopee API: ${code}`);
  }

  const nodes = result.data?.productOfferV2?.nodes;

  if (!Array.isArray(nodes)) {
    throw new Error("Resposta de produtos invalida");
  }

  return nodes;
}

function filtrarProdutos(produtos) {
  const aprovados = [];
  let foraDoNicho = 0;

  for (const produto of produtos) {
    const categoria = classificarProduto(
      produto.productName
    );

    if (!categoria) {
      foraDoNicho++;
      continue;
    }

    const item = pick({
      ...produto,
      id: `shopee-${produto.shopId}-${produto.itemId}`
    }, "Shopee");

    if (!item) continue;

    item.categoria = categoria;
    aprovados.push(item);
  }

  return { aprovados, foraDoNicho };
}

export async function downloadShopee() {
  const candidates = [];
  const warnings = [];

  let received = 0;
  let successfulQueries = 0;
  let rejectedByNiche = 0;

  const keywords = [
    "organizador cozinha",
    "limpeza",
    "ferramentas",
    "decoracao"
  ];

  const consultas = [
    ...keywords.map(keyword => ({
      nome: keyword,
      argumentos:
        `keyword: ${JSON.stringify(keyword)}, page: 1,`
    })),
    {
      nome: "geral pagina 1",
      argumentos: "listType: 0, sortType: 1, page: 1,"
    },
    {
      nome: "geral pagina 2",
      argumentos: "listType: 0, sortType: 1, page: 2,"
    }
  ];

  for (const consulta of consultas) {
    try {
      const produtos = await consultarShopee(
        consulta.argumentos
      );

      successfulQueries++;
      received += produtos.length;

      const filtrados = filtrarProdutos(produtos);

      candidates.push(...filtrados.aprovados);
      rejectedByNiche += filtrados.foraDoNicho;

      console.log(
        `Shopee ${consulta.nome}: ` +
        `${produtos.length} recebidos, ` +
        `${filtrados.aprovados.length} elegiveis`
      );
    } catch (error) {
      console.error(
        `Shopee ${consulta.nome}:`,
        error.message
      );

      warnings.push(
        `Falha na consulta Shopee: ${consulta.nome}`
      );
    }
  }

  if (successfulQueries === 0) {
    throw new Error("Todas as consultas Shopee falharam");
  }

  const unique = [
    ...new Map(
      candidates.map(produto => [
        produto.id,
        produto
      ])
    ).values()
  ];

  console.log(
    `Shopee final: ${received} recebidos; ` +
    `${rejectedByNiche} fora do nicho; ` +
    `${unique.length} elegiveis`
  );

  return {
    received,
    candidates: unique,
    warnings
  };
}
