
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const MODELO = "gpt-6-luna";
const VERSAO_REGRAS = "garimpai-v2";
const LIMITE_LOTE = 10;

const CATEGORIAS = [
  "Utilidades",
  "Potes e cozinha",
  "Limpeza",
  "Lavanderia",
  "Ferramentas",
  "Pintura",
  "Casa inteligente",
  "Decoração",
  "Fora do nicho"
];

function hash(texto) {
  return createHash("sha256")
    .update(texto)
    .digest("hex")
    .slice(0, 32);
}

function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// O preco, o desconto, as vendas e a
// comissao NAO entram na identidade.
function identidade(produto) {
  return [
    produto.origem || "desconhecida",
    produto.id || "",
    normalizar(produto.nome)
  ].join("|");
}

function chave(produto) {
  return "classificacao-" + hash(
    String(produto.origem || "") +
    "|" +
    String(produto.id || "")
  );
}

function versao(produto) {
  return hash(
    VERSAO_REGRAS + "|" + identidade(produto)
  );
}

function aplicarClassificacao(produto, decisao) {
  return {
    ...produto,
    categoria: decisao.categoria,
    curadoriaIA: true,
    motivoCuradoria: decisao.motivo
  };
}

function resultadoBase(produtos, motivo) {
  return {
    produtos: [],
    analisados: 0,
    cacheHits: 0,
    pendentes: produtos.length,
    cobrancaRealizada: false,
    motivo
  };
}

export async function filtrarComIA(
  produtos,
  { permitirCobranca = false } = {}
) {
  if (!Array.isArray(produtos)) {
    throw new Error("Lista de produtos invalida");
  }

  // A IA permanece BLOQUEADA por padrao.
  // Exige tres autorizacoes para chamar a API.
  const autorizado =
    permitirCobranca === true &&
    process.env.GARIMPAI_IA_ENABLED === "true" &&
    process.env.GARIMPAI_IA_MANUAL_TEST === "AUTORIZADO";

  if (!autorizado) {
    return resultadoBase(
      produtos,
      "IA bloqueada: nenhuma chamada paga autorizada"
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return resultadoBase(
      produtos,
      "Chave OpenAI indisponivel"
    );
  }

  if (produtos.length === 0) {
    return resultadoBase(produtos, "Sem produtos");
  }

  const store = getStore("garimpai-ia");
  const lote = produtos.slice(0, LIMITE_LOTE);

  const aprovados = [];
  const desconhecidos = [];
  let cacheHits = 0;

  // Primeiro, procura classificacoes anteriores.
  // Erros no cache interrompem o processo.
  for (const produto of lote) {
    const salvo = await store.get(
      chave(produto),
      { type: "json" }
    );

    if (
      salvo &&
      salvo.versao === versao(produto) &&
      typeof salvo.aprovado === "boolean" &&
      CATEGORIAS.includes(salvo.categoria)
    ) {
      cacheHits++;

      if (
        salvo.aprovado &&
        salvo.categoria !== "Fora do nicho"
      ) {
        aprovados.push(
          aplicarClassificacao(produto, salvo)
        );
      }
    } else {
      desconhecidos.push(produto);
    }
  }

  if (!desconhecidos.length) {
    return {
      produtos: aprovados,
      analisados: 0,
      cacheHits,
      pendentes: produtos.length - lote.length,
      cobrancaRealizada: false,
      motivo: "Classificacoes recuperadas do cache"
    };
  }

  // Um identificador exclusivo por posicao
  // evita confusao entre lojas e produtos.
  const entrada = desconhecidos.map((p, i) => ({
    id: String(i),
    nome: String(p.nome || "")
  }));

  const instrucoes = `
Voce e responsavel pela curadoria do Garimpai,
um site brasileiro de casa, construcao e utilidades.

Decida se cada produto pertence ao nicho.
Classifique pela funcao principal do produto,
nao por palavras secundarias do titulo.

Categorias permitidas:
${CATEGORIAS.join(", ")}.

Exemplos:
- Utensilios de silicone de cozinha:
  Potes e cozinha.
- Chaleira eletrica:
  Potes e cozinha.
- Furadeira e parafusadeira:
  Ferramentas.
- Saco de lixo domestico:
  Limpeza.
- Varal de roupas:
  Lavanderia.
- Lampada inteligente residencial:
  Casa inteligente.

Rejeite suplementos, roupas, cosmeticos,
eletronicos pessoais e produtos sem relacao
clara com o nicho.

Se o titulo for insuficiente ou ambiguo,
rejeite como Fora do nicho.

O motivo deve ser curto, objetivo e
fundamentado apenas no nome recebido.

Nao invente preco, avaliacao, qualidade,
caracteristicas ou especificacoes.

Responda exatamente uma classificacao
para cada identificador recebido.
`;

  const schema = {
    type: "json_schema",
    name: "garimpai_curadoria",
    strict: true,
    schema: {
      type: "object",
      properties: {
        resultados: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              aprovado: { type: "boolean" },
              categoria: {
                type: "string",
                enum: CATEGORIAS
              },
              motivo: { type: "string" }
            },
            required: [
              "id",
              "aprovado",
              "categoria",
              "motivo"
            ],
            additionalProperties: false
          }
        }
      },
      required: ["resultados"],
      additionalProperties: false
    }
  };

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODELO,
        instructions: instrucoes,
        input: JSON.stringify(entrada),
        text: { format: schema },
        max_output_tokens: 2500,
        store: false
      }),
      signal: AbortSignal.timeout(24000)
    }
  );

  if (!response.ok) {
    throw new Error(
      "OpenAI HTTP " + response.status
    );
  }

  const dados = await response.json();

  if (dados.status !== "completed") {
    throw new Error(
      "Classificacao da IA incompleta"
    );
  }

  const texto = (dados.output || [])
    .flatMap(x => x.content || [])
    .filter(x => x.type === "output_text")
    .map(x => x.text)
    .join("");

  const json = JSON.parse(texto);
  const resultados = json.resultados;

  if (
    !Array.isArray(resultados) ||
    resultados.length !== desconhecidos.length
  ) {
    throw new Error(
      "Quantidade de classificacoes invalida"
    );
  }

  const recebidos = new Map();
  const idsEsperados = new Set(
    entrada.map(p => p.id)
  );

  // Valida toda a resposta antes
  // de registrar qualquer decisao.
  for (const item of resultados) {
    if (
      !idsEsperados.has(item.id) ||
      recebidos.has(item.id) ||
      typeof item.aprovado !== "boolean" ||
      !CATEGORIAS.includes(item.categoria) ||
      typeof item.motivo !== "string" ||
      item.motivo.trim().length === 0 ||
      (item.aprovado &&
        item.categoria === "Fora do nicho") ||
      (!item.aprovado &&
        item.categoria !== "Fora do nicho")
    ) {
      throw new Error(
        "Resposta inconsistente da IA"
      );
    }

    recebidos.set(item.id, item);
  }

  for (let i = 0; i < desconhecidos.length; i++) {
    const produto = desconhecidos[i];
    const item = recebidos.get(String(i));

    if (!item) {
      throw new Error(
        "Produto sem classificacao"
      );
    }

    const decisao = {
      versao: versao(produto),
      aprovado: item.aprovado,
      categoria: item.categoria,
      motivo: item.motivo.trim().slice(0, 200),
      analisadoEm: new Date().toISOString()
    };

    // Salva tanto aprovados quanto rejeitados.
    await store.setJSON(chave(produto), decisao);

    if (decisao.aprovado) {
      aprovados.push(
        aplicarClassificacao(produto, decisao)
      );
    }
  }

  return {
    produtos: aprovados,
    analisados: desconhecidos.length,
    cacheHits,
    pendentes: produtos.length - lote.length,
    cobrancaRealizada: true,
    tokens: dados.usage?.total_tokens ?? null,
    motivo: "Classificacao concluida"
  };
}
