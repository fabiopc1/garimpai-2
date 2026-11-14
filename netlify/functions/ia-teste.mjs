
const MODELO = "gpt-6-luna";

const PRODUTOS = [
  {
    id: 1,
    nome: "Kit 12 Potes Hermeticos para Cozinha"
  },
  {
    id: 2,
    nome: "Creatina Monohidratada 300g"
  },
  {
    id: 3,
    nome: "Parafusadeira e Furadeira Sem Fio"
  },
  {
    id: 4,
    nome: "Fone Bluetooth Sem Fio"
  },
  {
    id: 5,
    nome: "Sacos de Lixo Reforcados 100 Litros"
  }
];

export default async function handler() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("IA: chave nao configurada.");
    return;
  }

  console.log("Garimpai IA: iniciando teste.");

  const instrucoes = `
Voce e o curador de produtos do Garimpai,
uma plataforma brasileira de Casa, Construcao
e Utilidades Domesticas.

Analise os produtos enviados.

Aceite produtos relacionados a:
- Cozinha e utensilios domesticos
- Limpeza e descartaveis
- Lavanderia
- Organizacao
- Ferramentas para obras e reparos
- Construcao e reforma
- Iluminacao e eletrica
- Banheiro e hidraulica
- Decoracao
- Jardim
- Casa inteligente

Rejeite:
- Suplementos alimentares
- Roupas e calcados pessoais
- Fones e eletronicos pessoais
- Cosmeticos
- Produtos sem relacao clara com a casa

Responda SOMENTE com JSON valido.

Formato:
{
  "resultados": [
    {
      "id": 1,
      "aprovado": true,
      "categoria": "Cozinha",
      "motivo": "Produto util para armazenar alimentos"
    }
  ]
}

Retorne exatamente um resultado para cada produto.
Nao invente informacoes.
`;

  try {
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
          input: JSON.stringify(PRODUTOS),
          max_output_tokens: 800,
          store: false
        }),
        signal: AbortSignal.timeout(20000)
      }
    );

    if (!response.ok) {
      console.error(
        "IA: erro HTTP",
        response.status
      );
      return;
    }

    const data = await response.json();

    const texto = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("");

    if (!texto) {
      console.error(
        "IA: resposta sem texto.",
        data.status || "status desconhecido"
      );
      return;
    }

    const limpo = texto
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const resultado = JSON.parse(limpo);

    if (!Array.isArray(resultado.resultados)) {
      console.error("IA: formato inesperado.");
      return;
    }

    console.log(
      "RESULTADO DA IA:",
      JSON.stringify(resultado.resultados, null, 2)
    );

    console.log(
      "USO DE TOKENS:",
      JSON.stringify(data.usage || {})
    );

    console.log(
      "Garimpai IA: teste concluido."
    );

  } catch (error) {
    console.error(
      "IA: falha no teste:",
      error.name || "Erro desconhecido"
    );
  }
}

// Agendamento anual temporario.
// Executaremos manualmente em Run now.
// Remover este arquivo depois do teste.
export const config = {
  schedule: "0 0 1 1 *"
};
