export function parseCSV(csv) {
  // CSV RFC4180; campos com virgulas, quebras de linha e aspas.
  const rows=[];let row=[],cell='',quoted=false;const first=csv.split(/\r?\n/,1)[0];const sep=first.includes('\t')?'\t':first.includes(';')&&!first.includes(',')?';':',';
  for(let i=0;i<csv.length;i++){
    const c=csv[i];
    if(quoted){if(c==='"' && csv[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quoted=false;}else cell+=c;}
    else if(c==='"')quoted=true;
    else if(c===sep){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
  const header=(rows.shift()||[]).map(x=>x.trim().toLowerCase());
  return rows.filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));
}
export function priceNumber(v){
  let s=String(v??'').replace(/R\$|BRL|\s/g,'').trim();
  if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(s.includes(','))s=s.replace(',','.');
  const n=Number(s);return Number.isFinite(n)?n:NaN;
}
export function evaluate({name,image,merchant,category}){
  const str=(name+' '+category).toLowerCase();
  const cat=/porcelanato|revestimento|piso|argamassa|rejunte/.test(str)?'Revestimentos':/furadeira|parafusadeira|serra|martelete|esmerilh|trena|broca|ferrament|nivel/.test(str)?'Ferramentas':/tinta|rolo|pincel|massa corrida/.test(str)?'Pintura':/torneira|tubo|conex[aã]o|chuveiro|hidraul/.test(str)?'Hidráulica':/ilumina|led|lumin[aá]ria|disjuntor|el[eé]tric/.test(str)?'Elétrica':'Ferragens';
  // score de completude editorial; nao e nota de qualidade nem garantia de entrega
  return {score:Math.min(85,40+(image?20:0)+(merchant?15:0)+(category?10:0)),category:cat};
}
export function updateHistory(oldHistory, products, at=new Date()){
  const history={...oldHistory}, stamp=at.toISOString();
  for(const p of products){
    const prev=Array.isArray(history[p.id])?history[p.id]:[];
    const recent=prev.filter(x=>Date.parse(x.at)>=at.getTime()-8*864e5);
    // Mantem uma observacao por periodo (evita que atualizacoes repetidas contem como confirmacao)
    const last=recent.at(-1);
    if(!last || at.getTime()-Date.parse(last.at)>3*3600e3)recent.push({at:stamp,price:p.preco});
    history[p.id]=recent.slice(-50);
    const previous=recent.filter(x=>Date.parse(x.at)<at.getTime()-24*3600e3);
    const distinctDays=new Set(previous.map(x=>x.at.slice(0,10)));
    if(previous.length>=2 && distinctDays.size>=2){
      const sorted=previous.map(x=>x.price).sort((a,b)=>a-b);
      const baseline=sorted[Math.floor(sorted.length/2)];
      const discount=Math.round((1-p.preco/baseline)*100);
      if(discount>=15){p.descontoVerificado=discount;p.statusPreco='Queda registrada no historico do Garimpai';}
    }
  }
  for(const k of Object.keys(history))if(!products.some(p=>p.id===k) && history[k]?.every(x=>Date.parse(x.at)<at.getTime()-8*864e5))delete history[k];
  return history;
}
