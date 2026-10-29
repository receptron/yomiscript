import {chromium} from 'playwright';
const b=await chromium.launch();const pg=await b.newPage();pg.on('console',m=>console.log('console:',m.text()));
await pg.goto('http://localhost:8811/');await pg.waitForFunction(()=>document.getElementById('st').textContent=='ready',null,{timeout:120000});
for(const n of ['mix_4','osaka_n1']){await pg.selectOption('#p',{label:n});await pg.click('#go');
await pg.waitForFunction(()=>/done|error/.test(document.getElementById('st').textContent),null,{timeout:180000});
console.log(n,await pg.textContent('#st'));await pg.evaluate(()=>{document.getElementById('st').textContent=''})}
await b.close();
