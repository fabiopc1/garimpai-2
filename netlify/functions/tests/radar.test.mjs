import test from 'node:test';import assert from 'node:assert/strict';
import {parseCSV,priceNumber,updateHistory} from '../netlify/functions/ranking.mjs';
import {fromAwin,validateFeedURL} from '../netlify/functions/awin.mjs';
test('parse CSV aspas e virgulas',()=>{const r=parseCSV('product_name,price\n"Luminaria, LED",59.90\n');assert.equal(r[0].product_name,'Luminaria, LED')});
test('precos BRL e padrao decimal',()=>{assert.equal(priceNumber('R$ 1.299,90'),1299.9);assert.equal(priceNumber('59.90'),59.9)});
test('rejeita links nao Awin',()=>{assert.throws(()=>validateFeedURL('https://evil.com/datafeed'));});
test('importa so com link rastreavel',()=>{const base={product_name:'Luminaria LED para casa',price:'59.90',image_url:'https://example.org/a.jpg',merchant_name:'Loja ABC',merchant_category:'Casa'};assert.equal(fromAwin(base),null);assert.equal(fromAwin({...base,aw_deep_link:'https://www.awin1.com/cread.php?test=1'}).preco,59.9);});
test('historico nao cria desconto na primeira coleta',()=>{const p={id:'a',preco:50,descontoVerificado:null,statusPreco:'Preço observado'};updateHistory({},[p],new Date('2026-11-09T12:00:00Z'));assert.equal(p.descontoVerificado,null)});
