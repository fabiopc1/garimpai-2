GARIMPAÍ OBRA 3.0 — PROVA TÉCNICA SEM PAGAMENTOS

OBJETIVO
Este projeto transforma o Garimpaí em comparador de materiais de construção, calculadora de obra e importador automático de catálogos autorizados. Não vende produtos ainda. Não usa anúncios falsos.

O QUE FUNCIONA SEM CONFIGURAÇÃO
- Página para construção e reforma
- Busca, categorias e calculadora de pisos/tinta
- API /api/produtos de catálogo conectado

AUTOMAÇÃO COM FONTES REAIS
- AWIN_FEED_URL: feed autorizado da rede Awin (links monetizados do próprio feed)
- SUPPLIER_FEED_URL: URL HTTPS para CSV de um fornecedor que permita expressamente dropshipping
- SUPPLIER_FEED_HOSTS: somente os hosts autorizados, separados por vírgula (ex.: catalogo.fornecedor.com.br)
- Cada 6 horas a função sincronizar consulta feeds, filtra dados e atualiza Netlify Blobs.
- Feeds de fornecedores exigem colunas: sku,nome,custo,frete,estoque,preco_sugerido,dropshipping,imagem,categoria,fornecedor
- Produtos de fornecedores são mostrados como EM HOMOLOGAÇÃO, sem checkout, sem links de compra. Apenas links Awin válidos podem abrir lojas.
- Para iniciar vendas drop, são necessários fornecedor contratado, autorização de envio direto, integração de pedidos, confirmação de estoque/frete por CEP, checkout, atendimento, política de devolução e avaliação fiscal/contábil.

PUBLICAÇÃO
Substituir os arquivos do repositório github.com/fabiopc1/garimpai-2 pelos deste ZIP, sem pasta extra na raiz; o Netlify conectado deverá publicar automaticamente. NÃO publique antes de conferir/guardar o estado atual se quiser reverter.
Instalar variáveis de ambiente em Netlify > Environment variables, nunca em GitHub. Sem feeds autorizados, catálogo estará vazio; isso é intencional.

TESTES
node --test tests/*.test.mjs

AVISOS
- Cadastro com CPF em plataforma NÃO equivale a permissão fiscal para comércio recorrente.
- Nenhum fornecedor foi contratado nem testado neste pacote.
- Não use catálogo de lojas sem permissão. Sem fontes autorizadas não há varredura automática real.
- O score é completude de informação, não prova de qualidade.
