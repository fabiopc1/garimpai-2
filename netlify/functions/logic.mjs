
export function csvParse(src) {
  const rows = [];
  let row = [], cell = "", quote = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (quote) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quote = false;
      } else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n") {
        row.push(cell.replace(/\r$/, ""));
        if (row.some(s => s.trim())) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += c;
      }
    } else {
      cell += c;
    }
  }

  row.push(cell.replace(/\r$/, ""));
  if (row.some(s => s.trim())) rows.push(row);

  return rows;
}

// Mantem a conversao originalmente utilizada
// por nossas fontes de produtos.
export function normalizePercent(value) {
  const n = Number(
    String(value ?? "")
      .trim()
      .replace("%", "")
      .replace(",", ".")
  );

  if (!Number.isFinite(n) || n < 0) return 0;

  return n > 0 && n <= 1 ? n * 100 : n;
}

// Aceita 40.50, 40,50, 1.234,56 e 1234.56
function parsePrice(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  let s = String(value ?? "")
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .trim();

  if (!s) return NaN;

  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseNumber(value) {
  const n = Number(
    String(value ?? "")
      .trim()
      .replace(",", ".")
  );

  return Number.isFinite(n) ? n : NaN;
}

// Mantemos as categorias legadas para
// compatibilidade com os filtros existentes.
export const categories = [
  [
    "Organização",
    /organizador|organizadora|organizacao|organização|gaveta|cabide|armário|armario|prateleira|estante|sapateira|closet/i
  ],
  [
    "Cozinha",
    /cozinha|panela|marmita|alimento|tempero|air fryer|cafeteira|utensílio|utensilio|escorredor|pote|frigideira|talher/i
  ],
  [
    "Tecnologia",
    /usb|bluetooth|sensor|led|luminária|luminaria|carregador|eletrônico|eletronico|digital|wireless/i
  ]
];

export function categoryFor(value) {
  const s = String(value ?? "");

  return categories.find(
    ([name, regex]) => regex.test(s)
  )?.[0] || "Casa";
}

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function pick(raw, source = "planilha") {
  const title = String(
    raw.nome ?? raw.productName ?? ""
  ).trim().slice(0, 180);

  const url = safeUrl(
    raw.link_afiliado ?? raw.offerLink ?? ""
  );

  const image = safeUrl(
    raw.imagem ?? raw.imageUrl ?? ""
  );

  const price = parsePrice(
    raw.preco ?? raw.priceMin
  );

  const rating = parseNumber(
    raw.nota ?? raw.ratingStar
  );

  const count = parseNumber(
    raw.vendas ?? raw.sales ?? 0
  );

  const commission = normalizePercent(
    raw.comissao ?? raw.commissionRate
  );

  const discount = normalizePercent(
    raw.desconto ?? raw.priceDiscountRate
  );

  const approved = String(
    raw.aprovado ?? "sim"
  ).trim().toLowerCase();

  // FILTROS DO GARIMPAI
  const MIN_PRICE = 10;
  const MAX_PRICE = 500;
  const MIN_RATING = 4.5;
  const MIN_SALES = 30;

  const valid =
    title.length >= 8 &&
    Boolean(url) &&
    Number.isFinite(price) &&
    price >= MIN_PRICE &&
    price <= MAX_PRICE &&
    Number.isFinite(rating) &&
    rating >= MIN_RATING &&
    rating <= 5 &&
    Number.isFinite(count) &&
    count >= MIN_SALES &&
    commission > 0 &&
    commission <= 100 &&
    !["nao", "não", "false", "0"].includes(approved);

  if (!valid) return null;

  const safeDiscount = Math.max(
    0,
    Math.min(discount, 100)
  );

  const score = Math.round(
    Math.min(
      100,
      (rating / 5) * 35 +
      Math.min(count / 500, 1) * 20 +
      Math.min(commission / 12, 1) * 20 +
      Math.min(safeDiscount / 35, 1) * 10 +
      (image ? 15 : 0)
    )
  );

  return {
    id: String(
      raw.id ?? raw.itemId ?? `${source}-${title}`
    ).slice(0, 100),

    nome: title,
    preco: price,
    nota: rating,
    vendas: count,
    comissao: Math.round(commission * 100) / 100,
    descontoInformado: safeDiscount,
    imagem: image,
    link: url,

    categoria: categoryFor(
      `${title} ${raw.categoria || ""}`
    ),

    score,
    origem: source,

    loja: String(
      raw.loja ?? raw.shopName ?? source
    ).slice(0, 65),

    atualizado: new Date().toISOString()
  };
}

export function unique(arr) {
  const seen = new Set();

  return arr.filter(product => {
    const key = `${product.origem}-${product.id}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
