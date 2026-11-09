GARIMPAÍ 2.0 - LEIA ANTES DE PUBLICAR

Esta versão traz site dinâmico e função automática de busca/classificação. Ela não tem preços, fotos, promoções ou avaliações inventados. Sem uma fonte autorizada de produtos ela mostra catálogo vazio.

IMPORTANTE: NÃO publique somente a pasta "site" por Netlify Drop. Isso publicaria a aparência sem a função /api/produtos. Para funcionamento integral: use GitHub + Netlify Import from Git ou Netlify CLI, a partir da raiz desta pasta.

MODO 1: FONTE REAL VIA GOOGLE SHEETS
1) Abra Google Sheets. Crie uma planilha com exatamente os cabeçalhos do EXEMPLO-PRODUTOS.csv.
2) Preencha linhas com produtos reais e seu link de afiliado válido. O campo "vendas" é o volume informado pelo marketplace, NÃO número de avaliações. "comissao" aceita 0.08 ou 8 para 8%.
3) Menu Arquivo > Compartilhar > Publicar na Web; escolha guia e tipo CSV. ATENÇÃO: publicação torna os dados públicos. Não insira dados pessoais ou credenciais; apenas produtos e links.
4) Copie a URL CSV publicada.
5) No Netlify, Project configuration > Environment variables > Add variable: PRODUCTS_CSV_URL = URL publicada.
6) Inicie um novo deploy (variáveis alteradas necessitam nova execução). Atualizações da planilha serão consumidas pelo site automaticamente em visitas posteriores, sujeitas a cache (~15 minutos). Não precisa republicar ZIP.
7) Filtros mínimos automáticos: preço 20-200, nota >=4.5, vendas >=30, comissão >0, aprovado diferente de "não".

MODO 2: BUSCA AUTOMATIZADA NA SHOPEE (SE TIVER CREDENCIAIS DE API)
1) Acesse https://affiliate.shopee.com.br/open_api e solicite acesso à Open API pela Central de Ajuda, caso não tenha App ID e Secret. Ser afiliado não significa acesso à API.
2) No Netlify, Environment variables, crie SHOPEE_APP_ID e SHOPEE_SECRET. Não compartilhe essas chaves no chat, não coloque no Google Sheets ou HTML.
3) Faça novo deploy. A função buscará termos "organizador", "cozinha" e "luminaria" na API oficial da Shopee em cada ciclo de cache. Os produtos já retornam offerLink do afiliado. A consulta aplica filtros de preço, nota, número de vendas e comissão.
4) Teste https://SEU_SITE.netlify.app/api/produtos . Deve mostrar "sources" e "warnings". Caso a API retorne erro, consulte a documentação oficial da sua conta: https://affiliate.shopee.com.br/open_api . O formato foi baseado em documentação pública NÃO OFICIAL e pode requerer adaptação.

COMO SUBIR ATUALIZANDO O SITE EXISTENTE
1) Crie um repositório GitHub e faça upload dos arquivos da raiz: netlify.toml, pasta site, pasta netlify.
2) No Netlify, escolha Add new project > Import from Git; selecione o repositório.
3) Publique, e conecte ao nome anterior depois: no Netlify do site antigo, verifique as opções de repo/continuous deployment ou altere os nomes dos projetos para apontar o endereço antigo para o novo projeto. NÃO tente ter dois sites com o mesmo subdomínio ao mesmo tempo.
4) Configure variáveis e teste /api/produtos. Se nada configurado, o catálogo ficará vazio (correto).

NÃO PROMETEMOS QUALIDADE 'CONFIRMADA' OU DESCONTOS REALMENTE VALIDADOS: nota e vendas são sinais, não auditoria. O campo desconto do marketplace não é exibido como verdade comprovada. Esta versão ainda não inclui histórico de preço próprio, geração de vídeos nem anúncios automáticos em redes sociais.

Arquitetura: site/index.html + função Netlify netlify/functions/produtos.mjs + filtros em logic.mjs. Sem banco de dados e sem gasto obrigatório com IA. O algoritmo de score é determinístico, não um modelo generativo; é melhor para o primeiro filtro confiável.
