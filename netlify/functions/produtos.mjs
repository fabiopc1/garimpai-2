import {createHash} from 'node:crypto';
import {csvParse,pick,unique} from './logic.mjs';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=120, s-maxage=900, stale-while-revalidate=3600'};
async function getSheet(){
 const url=process.env.PRODUCTS_CSV_URL;
 if(!url)return [];
 const u=new URL(url);
 if(u.protocol!=='https:'||!['docs.google.com','drive.google.com'].includes(u.hostname))throw Error('Fonte CSV não permitida');
 const r=await fetch(u.toString(),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Planilha indisponível ('+r.status+')');
 const rows=csvParse(await r.text());const cols=rows.shift()?.map(x=>x.trim().toLowerCase());if(!cols?.includes('nome')||!cols?.includes('link_afiliado'))throw Error('Cabeçalhos CSV inválidos');
 return rows.slice(0,200).map(r=>pick(Object.fromEntries(cols.map((c,i)=>[c,r[i]||''])),'planilha')).filter(Boolean);
}
async function shopee(){
 const app=process.env.SHOPEE_APP_ID,secret=process.env.SHOPEE_SECRET;
 if(!app||!secret)return [];
 const words=['organizador','cozinha','luminaria'];
 const all=[];
 for(const keyword of words){
   const query=`{ productOfferV2(keyword:${JSON.stringify(keyword)}, listType:2, sortType:2, page:1, limit:30) { nodes { itemId productName offerLink imageUrl priceMin priceDiscountRate sales ratingStar commissionRate shopName periodEndTime } } }`;
   const payload=JSON.stringify({query});const ts=Math.floor(Date.now()/1000);
   const signature=createHash('sha256').update(`${app}${ts}${payload}${secret}`).digest('hex');
   const r=await fetch('https://open-api.affiliate.shopee.com.br/graphql',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`SHA256 Credential=${app}, Timestamp=${ts}, Signature=${signature}`},body:payload,signal:AbortSignal.timeout(9000)});
   if(!r.ok)throw Error('Shopee API HTTP '+r.status);
   const json=await r.json();if(json.errors?.length)throw Error('Shopee API: '+json.errors[0].message);
   const nodes=json.data?.productOfferV2?.nodes??[];
   for(const item of nodes){const end=Number(item.periodEndTime);if(end&&end*1000<Date.now())continue;const p=pick(item,'Shopee');if(p)all.push(p);}
 }
 return all;
}
export default async ()=>{
 const warnings=[];let list=[];let sources=[];
 if(process.env.PRODUCTS_CSV_URL){try{const a=await getSheet();sources.push({nome:'Planilha',recebidos:a.length});list.push(...a);}catch(e){warnings.push('Planilha: '+e.message);}}
 if(process.env.SHOPEE_APP_ID&&process.env.SHOPEE_SECRET){try{const a=await shopee();sources.push({nome:'Shopee API',recebidos:a.length});list.push(...a);}catch(e){warnings.push('Shopee: '+e.message);}}
 list=unique(list).sort((a,b)=>b.score-a.score).slice(0,100);
 return new Response(JSON.stringify({products:list,updatedAt:new Date().toISOString(),sources,warnings,configured:!!(process.env.PRODUCTS_CSV_URL||(process.env.SHOPEE_APP_ID&&process.env.SHOPEE_SECRET))}),{status:200,headers});
};
export const config={path:'/api/produtos'};
