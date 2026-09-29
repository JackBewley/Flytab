import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import * as core from '../core.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function harness() {
  const origin = 'chrome-extension://flytab/';
  const calls = [], listeners = {}, faults = {}, contexts = [];
  const windows = new Map([[10, {id:10, focused:true, width:1200, height:900}]]);
  const tabs = [{id:1, windowId:10, active:true, url:'https://source.example'},
    {id:2, windowId:10, active:false, url:'https://previous.example'}];
  let state = {version:1, order:[1,2], session:null}, popup = '', documentSequence = 0;
  const event = name => ({addListener(fn) {listeners[name] = fn;}});
  const record = (name, fn) => async (...args) => {calls.push({name,args}); return await fn(...args);};
  const chrome = {
    storage: {session: {
      get: record('storage.get', async () => ({flytab:structuredClone(state)})),
      set: record('storage.set', async value => {
        if (faults.saveOnce) {faults.saveOnce = false; throw Error('Save failed');}
        state = structuredClone(value.flytab);
      })
    }},
    tabs: {
      query: record('tabs.query', async () => faults.query ? await faults.query.promise : structuredClone(tabs)),
      get: record('tabs.get', async id => structuredClone(tabs.find(tab => tab.id === id))),
      update: record('tabs.update', async (id, properties) => {
        if (properties.active) for (const tab of tabs) tab.active = tab.id === id;
        return Object.assign(tabs.find(tab => tab.id === id), properties);
      }),
      onActivated:event('activated'), onCreated:event('created'), onRemoved:event('removed'), onReplaced:event('replaced')
    },
    windows: {
      WINDOW_ID_NONE:-1,
      getLastFocused: record('windows.getLastFocused', async () => ({...windows.get(faults.lastFocusedWindowId || 10), tabs:structuredClone(tabs)})),
      get: record('windows.get', async id => {if (!windows.has(id)) throw Error('Window closed'); return structuredClone(windows.get(id));}),
      create: record('windows.create', async () => {windows.set(12,{id:12,focused:true}); return {id:12};}),
      remove: record('windows.remove', async id => {windows.delete(id);}),
      update: record('windows.update', async (id, properties) => Object.assign(windows.get(id),properties)),
      onFocusChanged:event('focus'), onRemoved:event('windowRemoved')
    },
    runtime: {
      id:'flytab', getURL:path => origin + path,
      getContexts: record('runtime.getContexts', async filter => structuredClone(contexts.filter(context =>
        filter.contextTypes.includes(context.contextType) &&
        (!filter.documentIds || filter.documentIds.includes(context.documentId)) &&
        (!filter.documentUrls || filter.documentUrls.includes(context.documentUrl))))),
      sendMessage: record('runtime.sendMessage', async message => {
        if (message.type === 'flytab:close') {
          const index = contexts.findIndex(context => new URL(context.documentUrl).searchParams.get('session') === message.token);
          if (index !== -1) contexts.splice(index,1);
        }
      }),
      onMessage:event('message'), onInstalled:event('installed'), onStartup:event('startup')
    },
    action: {
      getUserSettings: record('action.getUserSettings', async () => ({isOnToolbar:!faults.unpinned})),
      setPopup: record('action.setPopup', async details => {popup = details.popup;}),
      openPopup: record('action.openPopup', async ({windowId}) => {
        if (faults.open) await faults.open.promise;
        if (faults.unsupported) throw Error('Only policy-installed extensions supported');
        contexts.push({contextType:'POPUP',documentId:'document-'+(++documentSequence),documentUrl:origin+popup,windowId});
      }),
      setBadgeText: record('action.setBadgeText',async () => {}),
      setTitle: record('action.setTitle',async () => {}), onClicked:event('click')
    },
    commands:{onCommand:event('command')}
  };
  const context = {...core,chrome,URL,crypto:{randomUUID},console:{error() {}}};
  const code = readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*?;\n/,'');
  vm.runInNewContext(code+'\nglobalThis.controller = {command,enqueue,message};',context);
  return {calls,contexts,faults,windows,listeners,chrome,controller:context.controller,
    get state() {return state;}, get popup() {return popup;},
    open:() => context.controller.enqueue(() => context.controller.command('switch-previous')),
    sender:() => ({id:'flytab',origin:origin.slice(0,-1),url:contexts[0].documentUrl,documentId:contexts[0].documentId})};
}

test('pinned action popup binds its real document, advances without refocusing and cancels without removing the browser window', async () => {
  const h = harness(); await h.open();
  assert.equal(h.state.session.kind,'action');
  assert.equal(h.state.session.windowId,10);
  assert.equal(h.popup,'');
  assert.equal(h.calls.some(call => call.name === 'windows.create'),false);
  const token = h.state.session.token;
  const sender = h.sender();
  assert.equal((await h.controller.message({type:'flytab:get',token},sender)).ok,true);
  assert.equal(h.state.session.documentId,sender.documentId);
  h.calls.length = 0;
  await h.open();
  assert.equal(h.state.session.index,1);
  assert.equal(h.calls.some(call => call.name === 'windows.update'),false);
  assert.equal((await h.controller.message({type:'flytab:cancel',token},sender)).ok,true);
  assert.equal(h.state.session,null);
  assert.equal(h.contexts.length,0);
  assert.equal(h.windows.has(10),true);
  assert.equal(h.calls.some(call => call.name === 'windows.remove'),false);
});

test('policy-restricted action opening clears toolbar configuration and falls back to an owned native window', async () => {
  const h = harness(); h.faults.unsupported = true; await h.open();
  assert.equal(h.state.session.kind,'window');
  assert.equal(h.state.session.windowId,12);
  assert.equal(h.popup,'');
  assert.equal(h.windows.has(10),true);
  assert.equal(h.calls.filter(call => call.name === 'action.openPopup').length,1);
  assert.equal(h.calls.filter(call => call.name === 'windows.create').length,1);
});

test('unpinned or unavailable action capability uses native popup without configuring a toolbar popup', async () => {
  for (const mode of ['unpinned','missing']) {
    const h = harness();
    if (mode === 'unpinned') h.faults.unpinned = true;
    else delete h.chrome.action.getUserSettings;
    await h.open();
    assert.equal(h.state.session.kind,'window');
    assert.equal(h.calls.some(call => call.name === 'action.openPopup'),false);
    assert.equal(h.calls.some(call => call.name === 'action.setPopup' && call.args[0].popup),false);
  }
});

test('failed history query waits for delayed action opening then closes only its document', async () => {
  const h = harness(); h.faults.query = deferred(); h.faults.open = deferred();
  const opening = h.open(); const rejected = assert.rejects(opening,/History failed/);
  await tick(); h.faults.query.reject(Error('History failed')); await tick();
  h.faults.open.resolve(); await rejected;
  assert.equal(h.contexts.length,0);
  assert.equal(h.popup,'');
  assert.equal(h.state.session,null);
  assert.equal(h.windows.has(10),true);
  assert.equal(h.calls.some(call => call.name === 'windows.remove'),false);
});

test('failed session save cleans up action bubble without closing its source window', async () => {
  const h = harness(); h.faults.saveOnce = true;
  await assert.rejects(h.open(),/Save failed/);
  assert.equal(h.contexts.length,0);
  assert.equal(h.popup,'');
  assert.equal(h.state.session,null);
  assert.equal(h.windows.has(10),true);
  assert.equal(h.calls.some(call => call.name === 'windows.remove'),false);
});

test('action authentication rejects a normal extension tab, wrong window, wrong document and wrong token URL', async () => {
  const h = harness(); await h.open();
  const token = h.state.session.token, sender = h.sender();
  const original = structuredClone(h.contexts[0]);
  for (const change of [{contextType:'TAB'},{windowId:99},{documentId:'impostor'}]) {
    Object.assign(h.contexts[0],original,change);
    assert.equal((await h.controller.message({type:'flytab:get',token},sender)).expired,true);
    assert.equal(h.state.session.documentId,undefined);
  }
  Object.assign(h.contexts[0],original);
  assert.equal((await h.controller.message({type:'flytab:get',token},{...sender,url:sender.url+'&extra=1'})).expired,true);
  assert.equal((await h.controller.message({type:'flytab:get',token},sender)).ok,true);
  assert.equal((await h.controller.message({type:'flytab:commit',token},{...sender,documentId:'impostor'})).expired,true);
  assert.equal(h.state.session.token,token);
});

test('dismissed action context starts a new session instead of cycling an invisible list', async () => {
  const h = harness(); await h.open(); const previous = h.state.session.token;
  h.contexts.length = 0;
  await h.open();
  assert.notEqual(h.state.session.token,previous);
  assert.equal(h.state.session.index,0);
  assert.equal(h.calls.filter(call => call.name === 'action.openPopup').length,2);
  assert.equal(h.windows.has(10),true);
});

test('toolbar immediately toggles while action session exists and only closes the extension bubble', async () => {
  const h = harness(); await h.open();
  h.listeners.click(); await h.controller.enqueue(async () => {});
  assert.deepEqual(Array.from(h.state.order),[2,1]);
  assert.equal(h.state.session,null);
  assert.equal(h.contexts.length,0);
  assert.equal(h.windows.has(10),true);
  assert.equal(h.calls.some(call => call.name === 'windows.remove'),false);
});

test('Chrome action sender without documentId binds a windowless POPUP context and checks it on later messages', async () => {
  const h = harness(); await h.open();
  h.contexts[0].windowId = -1;
  const token = h.state.session.token;
  const sender = h.sender(); delete sender.documentId;
  const popupDocumentId = h.contexts[0].documentId;
  assert.equal((await h.controller.message({type:'flytab:get',token},sender)).ok,true);
  assert.equal(h.state.session.documentId,popupDocumentId);
  assert.equal((await h.controller.message({type:'flytab:move',token,delta:1},sender)).ok,true);
  assert.equal((await h.controller.message({type:'flytab:commit',token},{...sender,tab:{windowId:10}})).expired,true);
  assert.equal((await h.controller.message({type:'flytab:get',token},{...sender,origin:'https://impostor.example'})).expired,true);
  h.contexts[0].documentId = 'replacement-document';
  assert.equal((await h.controller.message({type:'flytab:commit',token},sender)).expired,true);
  assert.equal(h.state.session.token,token);
  assert.equal(h.windows.has(10),true);
});

test('windowless action context cannot initially bind to a different last-focused browser window', async () => {
  const h = harness(); await h.open(); h.contexts[0].windowId = -1;
  const sender = h.sender(); delete sender.documentId;
  h.windows.set(11,{id:11,focused:true}); h.faults.lastFocusedWindowId = 11;
  assert.equal((await h.controller.message({type:'flytab:get',token:h.state.session.token},sender)).expired,true);
  assert.equal(h.state.session.documentId,undefined);
});

test('focused action bubble authenticates and cycles when Chrome reports its owner window unfocused', async () => {
  const h = harness(); await h.open();
  h.contexts[0].windowId = -1; h.windows.get(10).focused = false;
  const sender = h.sender(); delete sender.documentId;
  const token = h.state.session.token;
  assert.equal((await h.controller.message({type:'flytab:get',token},sender)).ok,true);
  h.calls.length = 0;
  await h.open();
  assert.equal(h.state.session.token,token);
  assert.equal(h.state.session.index,1);
  assert.equal(h.calls.some(call => call.name === 'windows.update' || call.name === 'action.openPopup'),false);
  assert.equal((await h.controller.message({type:'flytab:commit',token,id:2},sender)).ok,true);
  assert.deepEqual(Array.from(h.state.order),[2,1]);
  assert.equal(h.state.session,null);
  assert.equal(h.windows.has(10),true);
  assert.equal(h.calls.some(call => call.name === 'windows.remove'),false);
});

test('failed action opening does not steal focus with native fallback after the user leaves', async () => {
  const h = harness(); h.faults.open = deferred();
  const opening = h.open(); const rejected = assert.rejects(opening,/source window lost focus/);
  await tick(); h.windows.get(10).focused = false;
  h.faults.open.reject(Error('Opening interrupted')); await rejected;
  assert.equal(h.calls.some(call => call.name === 'windows.create'),false);
  assert.equal(h.calls.some(call => call.name === 'windows.remove'),false);
  assert.equal(h.popup,'');
  assert.equal(h.state.session,null);
});
