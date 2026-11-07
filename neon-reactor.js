(()=>{'use strict';
const audio=document.getElementById('audio'),screen=document.querySelector('.station-screen-inner');if(!audio||!screen)return;
const style=document.createElement('style');style.textContent=`
.reactor-panel{width:min(540px,100%);margin:15px auto 18px;padding:12px 14px;border:1px solid #8856dd77;border-radius:19px;background:linear-gradient(135deg,#14152ad9,#251744aa);box-shadow:0 0 28px #a041ff22;position:relative}
.reactor-head{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:10px;letter-spacing:.14em;color:#c7b1f7;margin-bottom:6px}
.reactor-head button{background:#342457;border:1px solid #805db7;border-radius:9px;color:white;padding:5px 9px;cursor:pointer;font-size:11px}
.reactor-panel canvas{display:block;width:100%;height:105px}
.reactor-caption{font-size:10px;color:#a9a1c5;margin-top:3px}
@media(prefers-reduced-motion:reduce){.reactor-panel canvas{opacity:.65}}
`;document.head.append(style);
const panel=document.createElement('div');panel.className='reactor-panel';panel.innerHTML='<div class="reactor-head"><span>✦ NEON AUDIO REACTOR</span><button type="button" aria-pressed="true" id="reactorToggle">Выключить</button></div><canvas id="reactorCanvas" aria-label="Световой музыкальный визуализатор"></canvas><div class="reactor-caption">Световая анимация • не анализирует частоты радиопотока</div>';
const controls=screen.querySelector('.station-screen-controls');if(controls)controls.before(panel);else screen.append(panel);
const canvas=panel.querySelector('canvas'),ctx=canvas.getContext('2d'),toggle=panel.querySelector('button');let enabled=true,last=0,phase=0;try{enabled=localStorage.getItem('solomud-reactor')!=='off'}catch{}
function sync(){canvas.hidden=!enabled;toggle.textContent=enabled?'Выключить':'Включить';toggle.setAttribute('aria-pressed',String(enabled))}sync();
toggle.addEventListener('click',()=>{enabled=!enabled;sync();try{localStorage.setItem('solomud-reactor',enabled?'on':'off')}catch{}});
function draw(time){requestAnimationFrame(draw);if(!enabled||document.hidden||time-last<40)return;last=time;const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const playing=!audio.paused&&!audio.ended&&audio.readyState>=2;phase+=playing?.12:.025;const n=55,gap=2,bw=w/n;for(let i=0;i<n;i++){const x=i*bw+gap/2,env=Math.pow(Math.sin(Math.PI*(i+1)/(n+1)),.6),wave=Math.abs(Math.sin(phase+i*.47)*Math.cos(phase*.47-i*.18)),v=playing?(8+env*(12+wave*(h-28))):3;const grad=ctx.createLinearGradient(0,h,0,h-v);grad.addColorStop(0,'#7355ff');grad.addColorStop(.55,'#d04dff');grad.addColorStop(1,'#36e8ff');ctx.fillStyle=grad;ctx.shadowColor='#9153ff';ctx.shadowBlur=playing?9:0;ctx.fillRect(x,h-v,Math.max(1,bw-gap),v)}ctx.shadowBlur=0}
requestAnimationFrame(draw);
})();