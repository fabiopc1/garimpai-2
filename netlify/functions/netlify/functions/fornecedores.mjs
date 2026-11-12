import { createHash } from 'node:crypto';
import { parseCSV, priceNumber } from './ranking.mjs';
const str=(v)=>String(v??'').trim();
const get=(r,...keys)=>{for(const k of keys){const v=r[k.toLowerCase()];if(v!==undefined&&str(v))return str(v)}return ''};
const urlOK=(value)=>{try{const u=new URL(value);return u.protocol==='https:'?u.toString():''}catch{return ''}};
export function validSupplierURL(raw,allowedHosts=''){
  const url=new URL(raw);const hosts=allowedHosts.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(url.protocol!=='https:'||!hosts.includes(url.hostname.toLowerCase())||url.username||url.password||url.port)throw Error('URL/host do fornecedor não autorizado');
  return url;
}
export function supplierRows(csv){
  const data=parseCSV(csv).slice(0,10000);const offers=[];
  for(const row of data){
    const sku=get(row,'sku','codigo');const name=get(row,'nome','produto');const cost=priceNumber(get(row,'custo','preco_custo'));
    const shipping=priceNumber(get(row,'frete','frete_estimado'));const qty=Number(get(row,'estoque','quantidade'));
    const sell=priceNumber(get(row,'preco_sugerido','preco_venda'));
    const active=get(row,'dropshipping','envio_direto').toLowerCase();const image=urlOK(get(row,'imagem','foto'));
    const category=get(row,'categoria')||'Ferragens';const merchant=get(row,'fornecedor','loja').slice(0,80);
    // Only accepted contract-based suppliers with valid shipping estimates, stock and images.
    if(!sku||name.length<6||!Number.isFinite(cost)||cost<=0||!Number.isFinite(shipping)||shipping<0||!Number.isFinite(sell)||sell<=0||!Number.isFinite(qty)||qty<1||!['sim','true','1'].includes(active)||!image||!merchant)continue;
    if(!['Ferramentas','Revestimentos','Pintura','Hidráulica','Elétrica','Ferragens'].includes(category))continue;
    const fee=sell*.05, reserve=sell*.08, after=sell-cost-shipping-fee-reserve;
    if(after<Math.max(25,sell*.15))continue;
    offers.push({sku,nome:name.slice(0,150),fornecedor:merchant,preco:sell,custo:cost,frete:shipping,estoque:qty,imagem:image,categoria:category,contribuicao:Math.round(after*100)/100});
  }
  // best supplier per SKU (lowest cost, same sell price assumed)
  const best=new Map();for(const offer of offers){const old=best.get(offer.sku);if(!old||offer.contribuicao>old.contribuicao)best.set(offer.sku,offer)}
  return {received:data.length,qualified:[...best.values()].sort((a,b)=>b.contribuicao-a.contribuicao).slice(0,100)};
}
export async function downloadSupplierFeed(url,hosts,fetchImpl=fetch){
  const u=validSupplierURL(url,hosts);const r=await fetchImpl(u,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Falha ao consultar fornecedor HTTP '+r.status);
  if(Number(r.headers.get('content-length'))>5_000_000)throw Error('Feed excedeu tamanho máximo');
  const b=await r.arrayBuffer();if(b.byteLength>5_000_000)throw Error('Feed excedeu tamanho máximo');
  return supplierRows(new TextDecoder().decode(b).replace(/^\uFEFF/,''));
}
export function publicCandidates(offers,now=new Date()){
 return offers.map(p=>({id:createHash('sha256').update('supplier:'+p.sku).digest('hex').slice(0,24),nome:p.nome,preco:p.preco,imagem:p.imagem,categoria:p.categoria,origem:'Fornecedor em homologação',loja:'Fornecedor em homologação',score:70,link:null,atualizado:now.toISOString(),statusPreco:'Preço sugerido para avaliação',descontoVerificado:null,modo:'homologacao'}));
}
