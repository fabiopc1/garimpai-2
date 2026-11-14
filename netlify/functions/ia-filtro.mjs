
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const MODELO = "gpt-6-luna";
const MAX_POR_LOTE = 20;

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

function hashProduto(produto) {
  return createHash("sha256")
    .update(JSON.stringify({
      nome: produto.nome,
      preco: produto.preco,
      categoria: produto.categoria
    }))
    .digest("hex")
    .slice(0, 24);
}

function chaveCache(produto) {
  const id = createHash("sha256")
    .update(String(produto.id))
    .digest("hex")
    .slice(0, 24);

  return `produto-${id}`;
}

function respostaSegura(produtos, motivo) {
  return {
    produtos: [],
    analisados: 0,
    cobrancaRealizada: false,
    motivo,
    pendentes: produtos.length
  };
}

export async function filtrarComIA(
  produtos,
  { permitirCobranca = false } = {}
) {
  if (!Array.isArray(produtos)) {
    throw new Error("Lista de produtos invalida");
  }

  // Nunca cobra automaticamente.
  if (
    !permitirCobranca ||
    process.env.GARIMPAI_IA_ENABLED !== "true"
  ) {
    return respostaSegura(
      produtos,
      "IA desativada: nenhuma chamada paga realizada"
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return respostaSegura(
      produtos,
      "Chave da IA indisponivel"
    );
  }

  const store = getStore("garimpai-ia");
  const lote = produtos.slice(0, MAX_POR_LOTE);

  const aprovados = [];
  const pendentes = [];
  let cacheHits = 0;

  for (const produto of lote) {
    const chave = chaveCache(produto);
    const versao = hashProduto(produto);

    let salvo = null;

    try {
      salvo = await store.get(chave, {
        type: "json"
      });
    } catch {
      // Falhas de leitura nao autorizam
      // cobranca silenciosa.
      return respostaSegura(
        produtos,
        "Falha na leitura do cache"
      );
    }

    if (salvo?.versao === versao) {
      cacheHits++;

      if (salvo.aprovado) {
        aprovados.push({
          ...produto,
          categoria: salvo.categoria
        });
      }
    } else {
      pendentes.push(produto);
    }
  }

  // Tudo foi analisado anteriormente.
  if (!pendentes.length) {
    return {
      produtos: aprovados,
      analisados: 0,
      cacheHits,
      cobrancaRealizada: false,
      pendentes: produtos.length - lote.length
    };
  }

  const entrada = pendentes.map(p => ({
    id: String(p.id),
    nome: String(p.nome),
    preco: p.preco
  }));

  const instrucoes = `
Voce faz curadoria de produtos para o
Garimpai Casa e Construcao.

Classifique cada produto pelo titulo.

Aceite apenas:
- utensilios para casa e cozinha
- limpeza e descartaveis domesticos
- lavanderia e organizacao
- ferramentas para reparos e obras
- materiais para construcao e reforma
- pintura
- casa inteligente e seguranca residencial
- decoracao

Rejeite:
- suplementos alimentares
- roupas e acessorios pessoais
- fones e eletronicos pessoais
- cosmeticos
- produtos exclusivamente automotivos
- qualquer produto fora do nicho

Produtos ambiguos devem ser rejeitados.

Use exatamente uma das categorias:
${CATEGORIAS.join(", ")}.

Para rejeitados, categoria:
Fora do nicho.

Responda com todos os IDs recebidos.
Nao invente dados.
`;

  const schema = {
    type: "json_schema",
    name: "curadoria_garimpai",
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
              }
            },
            required: [
              "id",
              "aprovado",
              "categoria"
            ],
            additionalProperties: false
          }
        }
      },
      required: ["resultados"],
      additionalProperties: false
    }
  };

  // Uma chamada para no maximo 20 produtos.
  const resposta = await fetch(
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

  if (!resposta.ok) {
    throw new Error(
      `OpenAI HTTP ${resposta.status}`
    );
  }

  const dados = await resposta.json();

  if (dados.status !== "completed") {
    throw new Error("Resposta da IA incompleta");
  }

  const texto = (dados.output || [])
    .flatMap(x => x.content || [])
    .filter(x => x.type === "output_text")
    .map(x => x.text)
    .join("");

  const resultado = JSON.parse(texto);

  if (!Array.isArray(resultado.resultados)) {
    throw new Error("Formato da IA invalido");
  }

  const esperado = new Map(
    pendentes.map(p => [String(p.id), p])
  );

  const vistos = new Set();

  // Valida todos os resultados antes de salvar.
  for (const item of resultado.resultados) {
    if (
      !esperado.has(item.id) ||
      vistos.has(item.id) ||
      !CATEGORIAS.includes(item.categoria) ||
      typeof item.aprovado !== "boolean"
    ) {
      throw new Error("Classificacao inconsistente");
    }

    vistos.add(item.id);
  }

  if (vistos.size !== pendentes.length) {
    throw new Error("Produtos sem classificacao");
  }

  const gravacoes = [];

  for (const item of resultado.resultados) {
    const produto = esperado.get(item.id);

    const aprovado =
      item.aprovado &&
      item.categoria !== "Fora do nicho";

    const categoria = aprovado
      ? item.categoria
      : "Fora do nicho";

    if (aprovado) {
      aprovados.push({
        ...produto,
        categoria
      });
    }

    gravacoes.push(
      store.setJSON(chaveCache(produto), {
        versao: hashProduto(produto),
        aprovado,
        categoria
      })
    );
  }

  await Promise.all(gravacoes);

  return {
    produtos: aprovados,
    analisados: pendentes.length,
    cacheHits,
    cobrancaRealizada: true,
    tokens: dados.usage?.total_tokens ?? null,
    pendentes: produtos.length - lote.length
  };
}
