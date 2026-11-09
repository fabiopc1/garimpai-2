export function csvParse(src){const rows=[];let row=[],cell='',quote=false;for(let i=0;i<src.length;i++){const c=src[i];if(quote){if(c==='"'&&src[i+1]==='"'){cell+='"';i++;}else if(c==='"')quote=false;else cell+=c;}else if(c==='"')quote=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));if(row.some(s=>s.trim()))rows.push(row);row=[];cell='';}else cell+=c;}row.push(cell.replace(/\r$/,''));if(row.some(s=>s.trim()))rows.push(row);return rows;}
export function normalizePercent(v){let n=Number(String(v??'').trim().replace('%','').replace(',','.'));if(!Number.isFinite(n))return 0;return n>0&&n<=1?n*100:n;}
export const categories=[['Cozinha',/cozinha|panela|cortador|fatiador|alimento|tempero|air fryer|cafeteira|utens.lio|escorredor|pote|silicone|seladora/i],['Organização',/organizador|organiza..o|gaveta|cabide|arm.rio|prateleira|caixa|guardar|closet/i],['Tecnologia',/usb|bluetooth|sensor|led|lumin.ria|carregador|eletr.nic|digital|wireless/i]];
export function categoryFor(s){return categories.find(([k,r])=>r.test(s))?.[0]||'Casa';}
const safeUrl=(s)=>{try{const u=new URL(String(s));return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
export function pick(raw,source='planilha'){
 const title=String(raw.nome??raw.productName??'').trim().slice(0,180);
 const url=safeUrl(raw.link_afiliado??raw.offerLink??'');
 const image=safeUrl(raw.imagem??raw.imageUrl??'');
 const price=Number(String(raw.preco??raw.priceMin??'').replace('R$','').trim().replace(',','.'));
 const rating=Number(String(raw.nota??raw.ratingStar??'').replace(',','.'));
 const count=Number(raw.vendas??raw.sales??0);
 const commission=normalizePercent(raw.comissao??raw.commissionRate);
 const discount=normalizePercent(raw.desconto??raw.priceDiscountRate);
 const approved=String(raw.aprovado??'sim').trim().toLowerCase();
 const valid=title.length>=8&&url&&price>=20&&price<=200&&rating>=4.5&&rating<=5&&count>=30&&commission>0&&(!['nao','não','false','0'].includes(approved));
 if(!valid)return null;
 const score=Math.round(Math.min(100, (rating/5)*35 + Math.min(count/500,1)*20 + Math.min(commission/12,1)*20 + Math.min(discount/35,1)*10 + (image?15:0)));
 return {id:String(raw.id??raw.itemId??`${source}-${title}`).slice(0,100),nome:title,preco:price,nota:rating,vendas:count,comissao:Math.round(commission*100)/100,descontoInformado:discount,imagem:image,link:url,categoria:categoryFor(`${title} ${raw.categoria||''}`),score,origem:source,loja:String(raw.loja??raw.shopName??source).slice(0,65),atualizado:new Date().toISOString()};
}
export function unique(arr){const seen=new Set();return arr.filter(p=>{const key=p.origem+'-'+p.id;if(seen.has(key))return false;seen.add(key);return true;});}
