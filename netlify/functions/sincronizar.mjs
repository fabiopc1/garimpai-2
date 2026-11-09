import { getStore } from '@netlify/blobs';
import { downloadAwin } from './awin.mjs';
import { updateHistory } from './ranking.mjs';
import { downloadSupplierFeed, publicCandidates } from './fornecedores.mjs';
export default async ()=>{
  const now=new Date();
  const url=process.env.AWIN_FEED_URL;
  const supplierURL=process.env.SUPPLIER_FEED_URL;
  if(!url&&!supplierURL){console.log('Garimpai: nenhuma fonte conectada');return new Response('Sem fonte configurada',{status:200});}
  const store=getStore('garimpai-catalogo');
  try {
    let received=0;let candidates=[];const sources=[];const warnings=[];
    if(url){try{const data=await downloadAwin(url);received+=data.received;candidates.push(...data.candidates);sources.push({nome:'Awin',recebidos:data.received,elegiveis:data.candidates.length});}catch(e){warnings.push('Falha na fonte Awin');console.error('Awin:',e.message)}}
    if(supplierURL){try{const data=await downloadSupplierFeed(supplierURL,process.env.SUPPLIER_FEED_HOSTS||'');received+=data.received;candidates.push(...publicCandidates(data.qualified,now));sources.push({nome:'Fornecedores em avaliação',recebidos:data.received,elegiveis:data.qualified.length});}catch(e){warnings.push('Falha na fonte de fornecedores');console.error('Fornecedor:',e.message)}}
    if(!candidates.length){console.log('Nenhum item valido; catalogo anterior preservado');return new Response('Sem produtos elegiveis',{status:200});}
    const unique=[...new Map(candidates.map(p=>[p.id,p])).values()];
    const ranked=unique.sort((a,b)=>b.score-a.score).slice(0,100);
    const history=await store.get('historico',{type:'json'})||{};
    const updatedHistory=updateHistory(history,ranked,now);
    await store.setJSON('historico',updatedHistory);
    await store.setJSON('atual',{products:ranked,updatedAt:now.toISOString(),sources,warnings,configured:true});
    console.log('Garimpai atualizado: '+ranked.length+' produtos, '+received+' linhas recebidas');
    return new Response('Atualizado: '+ranked.length,{status:200});
  }catch(e){console.error('Falha na coleta:',String(e.message).slice(0,160));return new Response('Erro na sincronizacao',{status:500});}
};
export const config={schedule:'0 */6 * * *'};
