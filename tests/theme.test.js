import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../theme.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const messages=[];const media={matches:false,addEventListener(type,listener){this.change=listener;}};
 const context={matchMedia:()=>media,setInterval(fn,ms){context.poll=fn;context.delay=ms;},chrome:{runtime:{async sendMessage(message){messages.push(message);return {ok:!context.fail};}}}};
 vm.runInNewContext(source,context);return {context,messages,media};
}
test('appearance reports once, then unchanged polling does not wake the worker',async()=>{
 const h=harness();await tick();assert.equal(h.context.delay,5000);assert.equal(h.messages.length,1);
 await h.context.poll();await h.context.poll();assert.equal(h.messages.length,1);
 h.media.matches=true;await h.context.poll();assert.equal(h.messages.length,2);assert.equal(h.messages[1].dark,true);
 await h.media.change();assert.equal(h.messages.length,2);
});
test('failed icon application retries without permanently caching the failed preference',async()=>{
 const h=harness();await tick();h.context.fail=true;h.media.matches=true;
 await h.context.poll();h.context.fail=false;await h.context.poll();assert.equal(h.messages.length,3);
 await h.context.poll();assert.equal(h.messages.length,3);
});
