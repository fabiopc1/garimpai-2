// Feeds Awin CSV sem compactacao, exclusivamente de dominios oficiais.
import { createHash } from 'node:crypto';
import { parseCSV, evaluate, priceNumber } from './ranking.mjs';
const HOSTS = new Set(['productdata.awin.com','ui.awin.com']);
export function validateFeedURL(input) {
  if (!input) throw new Error('AWIN_FEED_URL nao configurada');
  const u = new URL(input);
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) throw new Error('Host do feed nao autorizado');
  if (!u.pathname.includes('productdata') && !u.pathname.includes('datafeed')) throw new Error('URL nao parece ser um feed Awin');
  return u;
}
function get(row, ...names) {
  for(const n of names) {const key=Object.keys(row).find(k=>k.toLowerCase()===n.toLowerCase()); if(key && row[key]) return row[key];}
  return '';
}
function safeHttp(v){try{const u=new URL(String(v));return ['https:','http:'].includes(u.protocol)?u.toString():''}catch{return ''}}
function idOf(v){return createHash('sha256').update(v).digest('hex').slice(0,24)}
export function fromAwin(row, now = new Date()) {
  const name=String(get(row,'product_name','title','g:title')).replace(/<[^>]*>/g,'').trim().slice(0,160);
  const tracking=safeHttp(get(row,'aw_deep_link','affiliate_link','tracking_url'));
  const image=safeHttp(get(row,'merchant_image_url','image_url','aw_image_url','g:image_link'));
  const price=priceNumber(get(row,'search_price','price','store_price','g:price'));
  const currency=String(get(row,'currency','g:currency','currency_code')||'BRL').toUpperCase();
  const merchant=String(get(row,'merchant_name','advertiser_name','store_name')).trim().slice(0,60);
  const category=String(get(row,'merchant_category','category_name','category','g:product_type'));
  const identifier=String(get(row,'aw_product_id','product_id','merchant_product_id','g:id')||tracking);
  if(name.length<9 || !tracking || !image || !Number.isFinite(price) || price<5 || price>5000 || currency!=='BRL') return null;
  if(!/(constru|reforma|ferrament|furadeira|parafus|bucha|martel|piso|porcelanato|revest|argamassa|tinta|rolo|serra|broca|torneira|chuveiro|eletric|hidraul|cimento|rejunte|trena|nivel|lixa|esmerilh|disjuntor|tubo|conex[aã]o|ilumina|led|lumin[aá]ria|fechadura|impermeabiliz)/i.test(name+' '+category))return null;
  const score=evaluate({name,price,image,merchant,category});
  return {id:idOf(identifier),nome:name,preco:price,nota:null,vendas:null,comissao:null,descontoInformado:null,imagem:image,link:tracking,categoria:score.category,score:score.score,origem:'Awin',loja:merchant||'Loja parceira',atualizado:now.toISOString(),qualidade:'Dados comerciais verificados no feed; qualidade fisica nao verificada',statusPreco:'Preço observado',descontoVerificado:null};
}
export async function downloadAwin(url, fetchImpl=fetch){
  const u=validateFeedURL(url);
  const response=await fetchImpl(u,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{Accept:'text/csv,text/plain,*/*'}});
  if(!response.ok)throw new Error('Erro de feed HTTP '+response.status);
  const contentLength=Number(response.headers.get('content-length'));
  if(contentLength>8_000_000)throw new Error('Feed muito grande. Gere feed com menos produtos na Awin.');
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength>8_000_000)throw new Error('Feed maior que 8 MB. Reduza categorias/lojas.');
  const bytes=new Uint8Array(buffer);
  if(bytes[0]===0x1f && bytes[1]===0x8b)throw new Error('Escolha CSV sem compactacao na Awin');
  const csv=new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/,'');
  const rows=parseCSV(csv).slice(0,30000);
  const candidates=rows.map(r=>fromAwin(r)).filter(Boolean);
  return {received:rows.length, candidates};
}
