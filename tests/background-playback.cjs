const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
function extract(a,b){return html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)))}
const calls=[],elements=new Map();
function $(id){if(!elements.has(id))elements.set(id,{textContent:'',classList:{contains:()=>false}});return elements.get(id)}
const context={console,Date,window:{SolomudNative:{postMessage:s=>calls.push(JSON.parse(s))}},navigator:{userAgent:'Android'},
 $,current:null,streamRequest:0,eqRequest:0,cancelStreamAttempt:null,waitingTimer:null,switchingStream:false,
 wantsPlayback:false,playing:false,activeStreamUrl:null,language:'ru',audio:{muted:false,volume:.6,pause(){calls.push({type:'html-pause'})}},
 hlsPlayer:null,sleepTimerHandle:null,clearTimeout(){},setTimeout(){throw Error('Native playback must not depend on JS timers')},
 stationId:s=>s.id,rememberLastStation(){},updateListenerCount(){},openStationScreen(){},resetTrackInfo(){},
 setPlaybackState:s=>context.playbackState=s,updatePlayer(){},render(){},markListening(){},stopListening(){},tr:s=>s,
 streamCandidates:s=>[s.url],connectStationStreams(){throw Error('Native playback must not use WebView audio')}
};
vm.createContext(context);
vm.runInContext(extract('const nativeRadio=', 'const audioListeners=')+extract('function resumeSpectrumAudio(){','function resetSpectrumElement(')+extract('async function playStation(', 'async function connectStationStreams(')+extract('function stopPlayback(){','let pendingSharedStation=')+extract('function setSleepTimer(', 'const firebaseConfig='),context);
(async()=>{
 const a={id:'a',name:'A',url:'https://radio.test/a.aac'};
 await context.playStation(a);
 assert.equal(calls.length,1);assert.equal(calls[0].type,'play');assert.equal(calls[0].volume,.6);
 const first=calls[0].request;
 context.window.onNativeRadioState({state:'playing',request:first,station:a});assert.equal(context.playing,true);
 await context.playStation({id:'b',name:'B',url:'https://radio.test/b.m3u8'});
 context.window.onNativeRadioState({state:'paused',request:first,station:a});assert.equal(context.current.name,'B');assert.equal(context.wantsPlayback,true);
 const second=calls[1].request;
 context.window.onNativeRadioState({state:'playing',request:second});assert.equal(context.playing,true);
 context.window.onNativeRadioState({state:'paused',request:second});assert.equal(context.wantsPlayback,false);
 context.stopPlayback();assert.ok(calls.some(c=>c.type==='pause'));
 context.setSleepTimer(15);assert.deepEqual(calls.at(-1),{type:'sleep',minutes:15});
 context.setSleepTimer(0);assert.deepEqual(calls.at(-1),{type:'sleep',minutes:0});
 await context.playStation({id:'c',name:'C',url:'http://radio.test/c'});assert.equal(context.playbackState,'failed');
 // Mobile browser bypasses AudioContext; desktop retains the real analyser.
 const spectrum=extract('function resumeSpectrumAudio(){','function resetSpectrumElement(');
 let created=0;
 for(const ua of ['Android','iPhone','Desktop']){
  vm.runInNewContext(spectrum+'resumeSpectrumAudio()', {nativeRadio:false,navigator:{userAgent:ua},window:{AudioContext:class{constructor(){created++;this.state='running'}}},eqContext:null});
 }
 assert.equal(created,1);
 console.log('PASS: script syntax, native routing, stale state rejection, system pause, stop, native sleep/cancel, HTTPS policy, mobile direct audio');
})().catch(error=>{console.error(error);process.exitCode=1});
