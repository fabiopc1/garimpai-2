import { getStore } from '@netlify/blobs';
export default async ()=>{
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60, s-maxage=180'};
  const empty={products:[],sources:[],warnings:[],configured:!!(process.env.AWIN_FEED_URL||process.env.SUPPLIER_FEED_URL),updatedAt:null};
  try{
    const saved=await getStore('garimpai-catalogo').get('atual',{type:'json'});
    if(!saved)return new Response(JSON.stringify({...empty,warnings:empty.configured?['Feed configurado. Aguarde ou execute a sincronizacao em Functions > sincronizar > Run now.']:[]}),{headers});
    const age=Date.now()-Date.parse(saved.updatedAt);
    if(!Number.isFinite(age)||age>36*3600e3)return new Response(JSON.stringify({...empty,warnings:['Catalogo desativado: ultima coleta ultrapassou 36 horas.']}),{headers});
    return new Response(JSON.stringify(saved),{headers});
  }catch(e){console.error('Falha ao ler catalogo:',e.message);return new Response(JSON.stringify({...empty,warnings:['Falha ao consultar armazenamento.']}),{status:503,headers});}
};
export const config={path:'/api/produtos'};
