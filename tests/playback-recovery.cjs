const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function extract(start,end){return html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)))}
function setup(outcomes){
 const nodes=new Map();
 function element(){return {children:[],textContent:'',hidden:true,setAttribute(){},addEventListener(){},append(...x){this.children.push(...x)},insertAdjacentElement(_,e){nodes.set(e.id,e)}}}
 for(const id of ['status','stationScreenHint'])nodes.set(id,element());
 const ctx={console,language:'ru',current:{id:'A'},playing:false,switchingStream:true,wantsPlayback:true,streamRequest:1,activeStreamUrl:'primary',playbackState:'ready',playbackAttempt:0,waitingTimer:null,
 playbackCopy:{ru:{ready:'Готов',connecting:'Подключаем',recovering:'Восстанавливаем',playing:'В эфире',failed:'Не удалось',retry:'Повторить',other:'Другая'},en:{failed:'Failed',retry:'Retry',other:'Another'}},
 document:{createElement:element,querySelectorAll:()=>[{dataset:{station:'A'}},{dataset:{station:'B'}}]},$:id=>nodes.get(id),stationId:s=>s.id,
 audio:{pause(){},removeAttribute(){},load(){}},streamCandidates:()=>['primary','backup'],attempts:[],statuses:[],
 stopListening(){},markListening(){},render(){},updatePlayer(){},clearTimeout(){},setTimeout(fn){ctx.timer=fn;return 1},
 tryStream:async url=>{ctx.attempts.push(url);const next=outcomes.shift();if(typeof next==='function')return next(ctx);if(next!==true)throw Error('offline')}
 };
 vm.createContext(ctx);
 vm.runInContext(extract('function setPlaybackState(', 'function stopPlayback(')+extract('async function connectStationStreams(', 'function updatePlayer(')+extract('function handleBuffering()', 'onAudio("waiting",handleBuffering)'),ctx);
 return ctx;
}
(async()=>{
 let c=setup([false,true]);await c.connectStationStreams(c.current,1,true);
 assert.deepEqual(c.attempts,['primary','backup']);assert.equal(c.playbackState,'playing');assert.equal(c.$('status').textContent,c.$('stationScreenHint').textContent);
 c=setup([false,false,false]);await c.connectStationStreams(c.current,1,true);
 assert.deepEqual(c.attempts,['primary','backup','primary']);assert.equal(c.playbackState,'failed');assert.equal(c.$('screenRecovery').hidden,false);assert.equal(c.$('playerRecovery').hidden,false);
 c.language='en';c.renderPlaybackStatus();assert.equal(c.$('status').textContent,'Failed');assert.equal(c.$('stationScreenHint').textContent,'Failed');
 c=setup([false,true]);c.streamCandidates=()=>['primary'];await c.connectStationStreams(c.current,1,true);assert.deepEqual(c.attempts,['primary','primary']);assert.equal(c.playbackState,'playing');
 c=setup([ctx=>{ctx.streamRequest=2;ctx.playbackState='paused';throw Error('cancelled')}]);await c.connectStationStreams(c.current,1,true);assert.equal(c.attempts.length,1);assert.equal(c.playbackState,'paused');
 c=setup([true]);c.switchingStream=false;c.audio.paused=true;await c.recoverCurrentStream('ended');assert.equal(c.playbackState,'playing');
 c=setup([]);c.switchingStream=false;c.handleBuffering();const first=c.timer;c.handleBuffering();assert.equal(c.timer,first);assert.equal(c.playbackState,'buffering');
 console.log('PASS: fallback, exhausted retries, synchronized statuses, language, same-URL retry, cancellation, ended recovery, repeated buffering');
})().catch(e=>{console.error(e);process.exitCode=1});
