(function(){
'use strict';
var $=function(s){return document.querySelector(s)};

// DOM refs
var domBgCanvas=$('#bgCanvas'),domLyricPCanvas=$('#lyricParticleCanvas');
var domNowTitle=$('#nowTitle'),domNowArtist=$('#nowArtist');
var domPlayIndicator=$('#playIndicator'),domIndicatorDot=$('#indicatorDot'),domIndicatorText=$('#indicatorText');
var domCenterLyrics=$('#centerLyrics'),domLyricLines=$('#lyricLinesContainer');
var domLyricBgWrapper=$('#lyricBgWrapper'),domLyricBgImgA=$('#lyricBgImgA'),domLyricBgImgB=$('#lyricBgImgB');
var domSongList=$('#songList'),domSongCount=$('#songCount');
var domBtnExport=$('#btnExport'),domBtnImport=$('#btnImport'),domImportFile=$('#importFileInput');
var domNeteaseToggle=$('#neteaseToggle'),domNeteaseBody=$('#neteaseBody'),domNeteaseStatusHint=$('#neteaseStatusHint');
var domNeteaseLoginForm=$('#neteaseLoginForm'),domNeteaseUserPanel=$('#neteaseUserPanel');
var domNeteaseCookieInput=$('#neteaseCookieInput'),domBtnNeteaseConnect=$('#btnNeteaseConnect'),domBtnNeteaseLogout=$('#btnNeteaseLogout');
var domNeteaseAvatar=$('#neteaseAvatar'),domNeteaseNickname=$('#neteaseNickname'),domNeteaseUid=$('#neteaseUid');
var domBtnImportPlaylist=$('#btnImportPlaylist'),domBtnRefreshAllUrls=$('#btnRefreshAllUrls');
var domTabQr=$('#tabQr'),domTabPhone=$('#tabPhone'),domPanelQr=$('#panelQr'),domPanelPhone=$('#panelPhone');
var domQrCanvas=$('#qrCanvas'),domQrStatus=$('#qrStatus'),domQrRefresh=$('#qrRefresh');
var domPhoneCountry=$('#phoneCountry'),domPhoneNumber=$('#phoneNumber'),domPhonePassword=$('#phonePassword'),domBtnPhoneLogin=$('#btnPhoneLogin');
var domModalImport=$('#modalImportPlaylist'),domPlaylistList=$('#playlistList'),domBtnImportCancel=$('#btnImportCancel');
var domBtnPrev=$('#btnPrev'),domBtnNext=$('#btnNext'),domBtnPlayPause=$('#btnPlayPause');
var domProgressBar=$('#progressBar'),domTimeCurrent=$('#timeCurrent'),domTimeDuration=$('#timeDuration');
var domToast=$('#toast'),domAudio=$('#audioPlayer');

// State
var STORAGE_KEY='claude-music-playlist',LYRICS_CACHE_KEY='claude-music-lyrics',NET_USER_KEY='claude-music-netease-user';
var playlist=[],lyricsCache={},currentPlayingId=null,isPlaying=false,neteaseUser=null,serverHasCookie=false;
var lyricLinesArr=[],currentLyricIdx=0,lyricAdvanceTimer=null,lyricTimeOffset=0;
var audioCtx=null,analyserNode=null,freqData=null,bassEnergy=0,rawBassEnergy=0;
var qrKey=null,qrTimer=null,neteaseOpen=false,audioRetryCount=0,qrLoginBusy=false;

// Album art background state
var bgImgToggle=false;      // false=A active, true=B active
var bgCurrentUrl='';         // URL currently displayed

// Utilities
function loadPlaylist(){try{var r=localStorage.getItem(STORAGE_KEY);if(r){var p=JSON.parse(r);if(Array.isArray(p))playlist=p}}catch(e){}}
function savePlaylist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(playlist))}catch(e){}}
function loadLyricsCache(){try{var r=localStorage.getItem(LYRICS_CACHE_KEY);if(r)lyricsCache=JSON.parse(r)}catch(e){}}
function saveLyricsCache(){try{localStorage.setItem(LYRICS_CACHE_KEY,JSON.stringify(lyricsCache))}catch(e){}}
function loadNeteaseUserCache(){try{var r=localStorage.getItem(NET_USER_KEY);if(r)neteaseUser=JSON.parse(r)}catch(e){}}
function saveNeteaseUserCache(){try{if(neteaseUser)localStorage.setItem(NET_USER_KEY,JSON.stringify(neteaseUser));else localStorage.removeItem(NET_USER_KEY)}catch(e){}}
function generateId(){return'song_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)}
var toastTimer=null;
function showToast(msg,type,duration){if(!type)type='info';if(!duration)duration=2500;if(toastTimer)clearTimeout(toastTimer);domToast.textContent=msg;domToast.className='toast '+type+' show';toastTimer=setTimeout(function(){domToast.classList.remove('show');toastTimer=null},duration)}
function escHtml(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}

// API
async function neteaseApi(action,params,checkCode){if(!params)params={};var res=await fetch('/api/netease/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});var data=await res.json();if(!res.ok)throw new Error(data.message||'API error');if(checkCode&&data.code&&data.code!==200)throw new Error(data.message||'code='+data.code);return data}
async function checkServerCookie(){try{var res=await fetch('/api/cookie');var data=await res.json();serverHasCookie=data.hasCookie;return data}catch(e){serverHasCookie=false;return{hasCookie:false}}}
async function setServerCookie(cookie){var res=await fetch('/api/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:cookie})});var data=await res.json();if(data.ok)serverHasCookie=true;return data}
async function clearServerCookie(){await fetch('/api/cookie',{method:'DELETE'});serverHasCookie=false}

// Web Audio
function buildAudioChain(){if(audioCtx)return;try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();analyserNode=audioCtx.createAnalyser();analyserNode.fftSize=256;analyserNode.smoothingTimeConstant=0.85;var src=audioCtx.createMediaElementSource(domAudio);src.connect(analyserNode);analyserNode.connect(audioCtx.destination);freqData=new Uint8Array(analyserNode.frequencyBinCount)}catch(e){}}
function updateAudioAnalysis(){if(!analyserNode||!freqData)return;analyserNode.getByteFrequencyData(freqData);var s=0;for(var i=0;i<9;i++)s+=freqData[i];rawBassEnergy=s/9/255;bassEnergy=bassEnergy*0.75+rawBassEnergy*0.25}

// ===== 专辑封面背景管理 =====
function getActiveBgImg(){return bgImgToggle?domLyricBgImgB:domLyricBgImgA}
function getHiddenBgImg(){return bgImgToggle?domLyricBgImgA:domLyricBgImgB}

function setLyricBackground(albumArtUrl){
  if(albumArtUrl===bgCurrentUrl)return;
  bgCurrentUrl=albumArtUrl;

  if(!albumArtUrl){
    // 淡出当前图片，隐藏背景层
    var active=getActiveBgImg();
    active.classList.add('fade-out');
    active.classList.remove('fade-in');
    domLyricBgWrapper.classList.remove('show');
    return;
  }

  // 显示背景层
  domLyricBgWrapper.classList.add('show');

  var hidden=getHiddenBgImg();
  // 防止重复加载同一 URL
  if(hidden.dataset.src===albumArtUrl)return;

  // 预加载新图片
  var preload=new Image();
  preload.onload=function(){
    // 确保没有被中途取消
    if(bgCurrentUrl!==albumArtUrl)return;

    hidden.src=albumArtUrl;
    hidden.dataset.src=albumArtUrl;

    // 交叉淡入淡出
    var active=getActiveBgImg();
    active.classList.add('fade-out');
    active.classList.remove('fade-in');
    hidden.classList.remove('fade-out');
    hidden.classList.add('fade-in');

    // 切换 active 标记
    bgImgToggle=!bgImgToggle;
  };
  preload.onerror=function(){
    // 加载失败不切换，保留现状
    if(bgCurrentUrl===albumArtUrl)bgCurrentUrl='';
  };
  preload.src=albumArtUrl;
}

function hideLyricBackground(){
  bgCurrentUrl='';
  var a=getActiveBgImg(),b=getHiddenBgImg();
  a.classList.add('fade-out');a.classList.remove('fade-in');
  b.classList.add('fade-out');b.classList.remove('fade-in');
  domLyricBgWrapper.classList.remove('show');
}

// 尝试为当前歌曲获取专辑封面
async function fetchAlbumArtForSong(song){
  if(!song)return null;
  if(song.albumArt)return song.albumArt;
  if(song.source==='netease'&&song.neteaseId){
    try{
      var d=await neteaseApi('song_detail',{ids:String(song.neteaseId)},true);
      var songs=d.songs||[];
      if(songs.length&&songs[0].al&&songs[0].al.picUrl){
        var art=songs[0].al.picUrl;
        song.albumArt=art;
        savePlaylist();
        return art;
      }
    }catch(e){}
  }
  return null;
}

// BG Particles
(function(){
var ctx=domBgCanvas.getContext('2d'),w,h,ps=[],N=180,CONN=110,MR=160,MF=1.2,mx=-9999,my=-9999;
function rs(){w=domBgCanvas.width=window.innerWidth;h=domBgCanvas.height=window.innerHeight}rs();window.addEventListener('resize',rs);
document.addEventListener('mousemove',function(e){mx=e.clientX;my=e.clientY});document.addEventListener('mouseleave',function(){mx=-9999;my=-9999});
for(var i=0;i<N;i++)ps.push({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4,size:5+Math.random()*7,bs:5+Math.random()*7,hue:240+Math.random()*40,alpha:.3+Math.random()*.4});
var bt=0,time=0;
(function an(ts){ctx.clearRect(0,0,w,h);bt+=(bassEnergy*2.5-bt)*.2;if(bt>1)bt=1;if(bt<0)bt=0;time=ts*.001;
for(var i=0;i<N;i++){var p=ps[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>w)p.vx*=-1;if(p.y<0||p.y>h)p.vy*=-1;p.x=Math.max(0,Math.min(w,p.x));p.y=Math.max(0,Math.min(h,p.y));var dx=p.x-mx,dy=p.y-my,dist=Math.sqrt(dx*dx+dy*dy);if(dist<MR&&dist>0){var force=(MR-dist)/MR*MF;p.vx+=dx/dist*force*.3;p.vy+=dy/dist*force*.3;var sp=Math.sqrt(p.vx*p.vx+p.vy*p.vy);if(sp>1.5){p.vx=p.vx/sp*1.5;p.vy=p.vy/sp*1.5}}
p.vx+=(Math.random()-.5)*.03;p.vy+=(Math.random()-.5)*.03;var ab=1+bt*2.5;p.size=p.bs*ab;var ga=Math.min(.9,p.alpha*(1+bt*1.2));var h2=p.hue+bt*30;
ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);var grd=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size*2);grd.addColorStop(0,'hsla('+h2+',70%,65%,'+ga.toFixed(2)+')');grd.addColorStop(.5,'hsla('+h2+',60%,50%,'+(ga*.3).toFixed(2)+')');grd.addColorStop(1,'hsla('+h2+',50%,40%,0)');ctx.fillStyle=grd;ctx.fill()}
for(var i=0;i<N;i++)for(var j=i+1;j<N;j++){var dx=ps[i].x-ps[j].x,dy=ps[i].y-ps[j].y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<CONN){var la=(1-dist/CONN)*.25*(1+bt),h3=250+bt*20;ctx.beginPath();ctx.moveTo(ps[i].x,ps[i].y);ctx.lineTo(ps[j].x,ps[j].y);ctx.strokeStyle='hsla('+h3+',50%,60%,'+la.toFixed(3)+')';ctx.lineWidth=.5+bt*.4;ctx.stroke()}}
updateAudioAnalysis();requestAnimationFrame(an)})()
})();

// Lyric orbit particles
(function(){
var ctx=domLyricPCanvas.getContext('2d'),w,h,op=[],bp=[],oa=0,OC=50;
function rs(){w=domLyricPCanvas.width=window.innerWidth;h=domLyricPCanvas.height=window.innerHeight}rs();window.addEventListener('resize',rs);
for(var i=0;i<OC;i++)op.push({angle:(Math.PI*2/OC)*i,br:180+Math.random()*60,r:180+Math.random()*60,size:2+Math.random()*2.5,sp:.003+Math.random()*.005,hue:260+Math.random()*40,alpha:.5+Math.random()*.4});
function spawnBurst(){for(var i=0;i<30;i++){var a=Math.random()*Math.PI*2,sv=2+Math.random()*6;bp.push({x:w/2,y:h/2,vx:Math.cos(a)*sv,vy:Math.sin(a)*sv,life:1,decay:.015+Math.random()*.03,size:2+Math.random()*4,hue:250+Math.random()*60})}}
window._lyricBurst=spawnBurst;
(function an(){ctx.clearRect(0,0,w,h);if(!currentPlayingId||domCenterLyrics.style.display==='none'){requestAnimationFrame(an);return}
var cx=w/2,cy=h/2;oa+=.008+bassEnergy*.03;var be=bassEnergy*80;
for(var j=0;j<OC;j++){var p=op[j],a2=p.angle+oa*p.sp*10;p.r=p.br+be*(.8+Math.sin(a2*3)*.4);var x=cx+Math.cos(a2)*p.r,y=cy+Math.sin(a2)*p.r*.55;ctx.beginPath();ctx.arc(x,y,p.size*(1+bassEnergy*2),0,Math.PI*2);var al2=p.alpha*(1+bassEnergy*.8);ctx.fillStyle='hsla('+p.hue+',70%,70%,'+al2.toFixed(2)+')';ctx.shadowColor='hsla('+p.hue+',80%,70%,'+(al2*.6).toFixed(2)+')';ctx.shadowBlur=p.size*3*(1+bassEnergy);ctx.fill();ctx.shadowBlur=0}
for(var j=bp.length-1;j>=0;j--){var b=bp[j];b.x+=b.vx;b.y+=b.vy;b.vx*=.96;b.vy*=.96;b.life-=b.decay;if(b.life<=0){bp.splice(j,1);continue}ctx.beginPath();ctx.arc(b.x,b.y,b.size*b.life,0,Math.PI*2);ctx.fillStyle='hsla('+b.hue+',70%,70%,'+b.life.toFixed(2)+')';ctx.fill()}
requestAnimationFrame(an)})()
})();

// Lyrics engine
function cleanLyricsText(t){if(!t)return'';var ls=t.split('\n'),cl=[];for(var i=0;i<ls.length;i++){var l=ls[i].trim();if(!l){cl.push('');continue}if(/^\{\s*"t"\s*:\s*\d+/.test(l))continue;if(/^\[\d{2}:\d{2}[^\]]*\][\s]*$/.test(l))continue;cl.push(l)}return cl.join('\n').replace(/\n{3,}/g,'\n\n')}
function parseLyricsToLines(t){if(!t||!t.trim())return[];var txt=cleanLyricsText(t);if(!txt.trim())return[];var ls=txt.split('\n'),res=[];for(var i=0;i<ls.length;i++){var l=ls[i].trim();if(!l)continue;var m=l.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)/);if(m){var min=parseInt(m[1]),sec=parseInt(m[2]),ms=m[3]?parseInt(m[3].padEnd(3,'0')):0,time=min*60+sec+ms/1000,text=(m[4]||'').trim();if(text)res.push({time:time,text:text})}else{res.push({time:-1,text:l})}}res.sort(function(a,b){return a.time-b.time});return res}
function findCurrentLyricIdx(){if(!lyricLinesArr.length)return 0;if(!lyricLinesArr.some(function(l){return l.time>=0}))return currentLyricIdx;var ct=(domAudio.currentTime||0)+lyricTimeOffset,idx=0;for(var i=0;i<lyricLinesArr.length;i++){if(lyricLinesArr[i].time>=0&&lyricLinesArr[i].time<=ct)idx=i;else if(lyricLinesArr[i].time>ct)break}return idx}

function renderCenterLyrics(){domLyricLines.innerHTML='';if(!lyricLinesArr.length){domLyricLines.innerHTML='<span class="no-lyrics">暂无歌词</span>';return}var idx=currentLyricIdx;if(idx>=1){var ps=document.createElement('span');ps.className='lyric-line past';ps.textContent=lyricLinesArr[idx-1].text;domLyricLines.appendChild(ps)}var cur=lyricLinesArr[idx],ce=document.createElement('span');ce.className='lyric-line current';ce.textContent=cur.text;if(cur.time>=0){ce.dataset.lyricTime=cur.time;ce.dataset.lyricNextTime=(idx+1<lyricLinesArr.length&&lyricLinesArr[idx+1].time>cur.time)?lyricLinesArr[idx+1].time:cur.time+5;var fl=document.createElement('span');fl.className='lyric-fill';fl.textContent=cur.text;fl.style.width='0%';ce.appendChild(fl)}domLyricLines.appendChild(ce);if(idx+1<lyricLinesArr.length){var nx=document.createElement('span');nx.className='lyric-line next';nx.textContent=lyricLinesArr[idx+1].text;domLyricLines.appendChild(nx)}if(idx+2<lyricLinesArr.length){var ft=document.createElement('span');ft.className='lyric-line future';ft.textContent=lyricLinesArr[idx+2].text;domLyricLines.appendChild(ft)}updateLyricFillProgress()}
function updateLyricFillProgress(){var ce=domLyricLines.querySelector('.lyric-line.current');if(!ce)return;var fl=ce.querySelector('.lyric-fill');if(!fl)return;var lt=parseFloat(ce.dataset.lyricTime||'-1');if(lt<0)return;var nt=parseFloat(ce.dataset.lyricNextTime||(lt+5)),dur=nt-lt,el=Math.max(0,((domAudio.currentTime||0)+lyricTimeOffset)-lt),pct=Math.min(100,el/dur*100);fl.style.width=pct+'%'}
function syncLyricFromAudioTime(){if(!isPlaying||!lyricLinesArr.length)return;if(!lyricLinesArr.some(function(l){return l.time>=0}))return;var ni=findCurrentLyricIdx();if(ni!==currentLyricIdx){currentLyricIdx=ni;renderCenterLyrics();if(window._lyricBurst)window._lyricBurst()}else{updateLyricFillProgress()}}
function startPlainLyricTimer(){if(lyricAdvanceTimer)clearInterval(lyricAdvanceTimer);lyricAdvanceTimer=null;if(lyricLinesArr.length<=1)return;if(lyricLinesArr.some(function(l){return l.time>=0}))return;if(isPlaying){lyricAdvanceTimer=setInterval(function(){if(!isPlaying)return;if(currentLyricIdx<lyricLinesArr.length-1){currentLyricIdx++;renderCenterLyrics();if(window._lyricBurst)window._lyricBurst()}else{clearInterval(lyricAdvanceTimer);lyricAdvanceTimer=null}},4000)}}

function refreshLyricsDisplay(){if(!currentPlayingId){domCenterLyrics.classList.remove('show');domBtnPlayPause.innerHTML='▶';domBtnPlayPause.className='pb-btn-play paused';hideLyricBackground();return}var c=lyricsCache[currentPlayingId];if(c&&c.text){lyricLinesArr=parseLyricsToLines(c.text);if(lyricLinesArr.length>0&&!lyricLinesArr.some(function(l){return l.time>=0})&&currentPlayingId){var cs=playlist.find(function(s){return s.id===currentPlayingId});if(cs&&cs.source==='netease'&&cs.neteaseId){delete lyricsCache[currentPlayingId];saveLyricsCache();fetchNeteaseLyrics(cs.neteaseId)}}currentLyricIdx=findCurrentLyricIdx();if(lyricLinesArr.length>0&&lyricLinesArr[0].time>5&&domAudio.currentTime>1&&domAudio.currentTime<lyricLinesArr[0].time){lyricTimeOffset=domAudio.currentTime-lyricLinesArr[0].time+.3;currentLyricIdx=findCurrentLyricIdx()}renderCenterLyrics();startPlainLyricTimer()}else{lyricLinesArr=[];currentLyricIdx=0;domLyricLines.innerHTML='<span class="no-lyrics">暂无歌词，播放后自动获取</span>'}if(currentPlayingId&&lyricLinesArr.length>0){domCenterLyrics.classList.add('show')}else if(currentPlayingId&&!lyricLinesArr.length){domCenterLyrics.classList.add('show')}else{domCenterLyrics.classList.remove('show')}}

async function fetchNeteaseLyrics(id){var s=playlist.find(function(s){return s.neteaseId===id});var sid=s?s.id:null;if(!sid||(lyricsCache[sid]&&lyricsCache[sid].text))return;try{var d=await neteaseApi('lyric_new',{id:id},true);var raw='';if(d.lrc&&d.lrc.lyric)raw=d.lrc.lyric;if(!raw&&d.tlyric&&d.tlyric.lyric)raw=d.tlyric.lyric;var t=cleanLyricsText(raw);if(t){lyricsCache[sid]={text:t,source:'网易云音乐',fetchedAt:Date.now()};saveLyricsCache();if(currentPlayingId===sid)refreshLyricsDisplay()}}catch(e){}}

// Playlist render
function renderPlaylist(){domSongList.innerHTML='';if(!playlist.length){domSongList.innerHTML='<li class="empty-hint">还没有歌曲，连接网易云导入吧 🎵</li>';domSongCount.textContent='共 0 首';return}domSongCount.textContent='共 '+playlist.length+' 首';playlist.forEach(function(song){var li=document.createElement('li');li.className='song-row';if(song.id===currentPlayingId)li.classList.add('active');li.setAttribute('data-song-id',song.id);var info=document.createElement('div');info.className='song-info';var nw=document.createElement('div');nw.style.display='flex';nw.style.alignItems='center';nw.style.gap='6px';if(song.source==='netease'){var tag=document.createElement('span');tag.className='song-source-tag';tag.textContent='云';nw.appendChild(tag)}if(!song.url||song.url==='null'){var wt=document.createElement('span');wt.className='song-source-tag';wt.style.background='rgba(255,180,80,.15)';wt.style.color='#fa4';wt.textContent='无链接';nw.appendChild(wt)}var ns=document.createElement('span');ns.className='song-name';ns.textContent=song.name;nw.appendChild(ns);var as=document.createElement('span');as.className='song-artist';as.textContent=song.artist;info.appendChild(nw);info.appendChild(as);var ad=document.createElement('div');ad.className='song-actions';var fb=document.createElement('button');fb.className='btn-icon fav-btn'+(song.fav?' active':'');fb.title=song.fav?'取消收藏':'收藏';fb.innerHTML=song.fav?'♥':'♡';fb.addEventListener('click',function(e){e.stopPropagation();toggleFav(song.id)});var pb=document.createElement('button');pb.className='btn-icon play-btn';pb.title='播放';pb.innerHTML='▶';pb.addEventListener('click',function(e){e.stopPropagation();playSong(song.id)});var db=document.createElement('button');db.className='btn-icon';db.title='删除';db.innerHTML='✕';db.style.color='var(--danger)';db.addEventListener('click',function(e){e.stopPropagation();deleteSong(song.id)});ad.appendChild(fb);ad.appendChild(pb);ad.appendChild(db);li.appendChild(info);li.appendChild(ad);li.addEventListener('click',function(){playSong(song.id)});domSongList.appendChild(li)})}
function deleteSong(id){var s=playlist.find(function(s){return s.id===id});if(!s)return;if(currentPlayingId===id)stopPlayback();playlist=playlist.filter(function(s){return s.id!==id});if(lyricsCache[id]){delete lyricsCache[id];saveLyricsCache()}savePlaylist();renderPlaylist();showToast('已删除：'+s.name)}
function toggleFav(id){var s=playlist.find(function(s){return s.id===id});if(!s)return;s.fav=!s.fav;savePlaylist();renderPlaylist()}

// Playback
function getEffectiveUrl(song){if(!song.url)return null;if(song.source==='netease'&&song.url)return'/stream?url='+encodeURIComponent(song.url);return song.url}
async function refreshSongUrl(song){if(song.source!=='netease'||!song.neteaseId)return null;var id=String(song.neteaseId);showToast('刷新链接…','info',1500);var tries=[{action:'song_url',params:{id:id,br:320000}},{action:'song_url_v1',params:{id:id,level:'lossless'}},{action:'song_url_v1',params:{id:id,level:'standard'}}];for(var i=0;i<tries.length;i++){try{var d=await neteaseApi(tries[i].action,tries[i].params);var item=(d.data&&d.data[0])?d.data[0]:null;if(item&&item.url){song.url=item.url;savePlaylist();renderPlaylist();return item.url}}catch(e){}}return null}
async function playSong(id){var song=playlist.find(function(s){return s.id===id});if(!song)return;if(currentPlayingId===id){togglePlayPause();return}
  // 更新专辑封面背景
  if(song.albumArt){setLyricBackground(song.albumArt)}else{fetchAlbumArtForSong(song).then(function(art){if(currentPlayingId===id&&art)setLyricBackground(art)})}
  if(song.url&&song.url!=='null'){buildAudioChain();var eu=getEffectiveUrl(song);if(eu){domAudio.src=eu;domAudio.load();try{await domAudio.play();onPlaybackStart(id);if(song.source==='netease'&&song.neteaseId)refreshSongUrl(song);return}catch(e){}}}if(song.source==='netease'&&song.neteaseId){var fr=await refreshSongUrl(song);if(fr){buildAudioChain();domAudio.src=getEffectiveUrl(song);domAudio.load();try{await domAudio.play();onPlaybackStart(id);return}catch(e){}}if(!song.url||song.url==='null'){showToast('此歌曲暂无播放链接','warn',4000);onPlaybackStart(id);isPlaying=false;updateUI();return}}if(!song.url||song.url==='null'){showToast('无播放链接','warn',3500);return}buildAudioChain();var eu2=getEffectiveUrl(song);if(!eu2){showToast('无效链接','warn');return}domAudio.src=eu2;domAudio.load();try{await domAudio.play();onPlaybackStart(id)}catch(err){showToast('播放失败：'+(err.name==='NotAllowedError'?'浏览器阻止自动播放':'链接失效'),'warn',4000);onPlaybackStart(id);isPlaying=false;updateUI()}}
function onPlaybackStart(id){currentPlayingId=id;isPlaying=true;lyricTimeOffset=0;domTimeCurrent.textContent='0:00';domTimeDuration.textContent='0:00';domProgressBar.value=0;updateNowPlaying();updateUI();renderPlaylist();refreshLyricsDisplay();if(window._lyricBurst)window._lyricBurst()}
function togglePlayPause(){if(domAudio.paused){var p=domAudio.play();if(p!==undefined)p.then(function(){isPlaying=true;updateUI()}).catch(function(){})}else{domAudio.pause();isPlaying=false;updateUI()}startPlainLyricTimer()}
function stopPlayback(){domAudio.pause();domAudio.src='';currentPlayingId=null;isPlaying=false;if(lyricAdvanceTimer){clearInterval(lyricAdvanceTimer);lyricAdvanceTimer=null}lyricLinesArr=[];currentLyricIdx=0;updateNowPlaying();updateUI();renderPlaylist();domCenterLyrics.classList.remove('show');hideLyricBackground()}
function updateNowPlaying(){if(currentPlayingId){var s=playlist.find(function(s){return s.id===currentPlayingId});if(s){domNowTitle.textContent=s.name;domNowArtist.textContent=s.artist;domPlayIndicator.style.display='flex'}}else{domNowTitle.innerHTML='<span class="now-playing-placeholder">未选择歌曲</span>';domNowArtist.textContent='';domPlayIndicator.style.display='none'}}
function updateUI(){if(currentPlayingId){domPlayIndicator.style.display='flex';if(isPlaying){domIndicatorDot.classList.remove('paused');domIndicatorText.textContent='正在播放';domBtnPlayPause.innerHTML='⏸';domBtnPlayPause.className='pb-btn-play playing'}else{domIndicatorDot.classList.add('paused');domIndicatorText.textContent='已暂停';domBtnPlayPause.innerHTML='▶';domBtnPlayPause.className='pb-btn-play paused'}}else{domPlayIndicator.style.display='none';domBtnPlayPause.innerHTML='▶';domBtnPlayPause.className='pb-btn-play paused'}}
function updateProgress(){var dur=domAudio.duration||0,cur=domAudio.currentTime||0;if(dur>0){domProgressBar.max=100;domProgressBar.value=cur/dur*100||0;domTimeCurrent.textContent=fmtTime(cur);domTimeDuration.textContent=fmtTime(dur)}}
function fmtTime(s){var m=Math.floor(s/60);return m+':'+(Math.floor(s%60)<10?'0':'')+Math.floor(s%60)}

// Audio events
domAudio.addEventListener('play',function(){isPlaying=true;updateUI();startPlainLyricTimer()});
domAudio.addEventListener('pause',function(){isPlaying=false;updateUI();if(lyricAdvanceTimer){clearInterval(lyricAdvanceTimer);lyricAdvanceTimer=null}});
domAudio.addEventListener('ended',function(){playNext()});
domAudio.addEventListener('timeupdate',function(){syncLyricFromAudioTime();updateProgress()});
(function lyricFillLoop(){if(isPlaying&&currentPlayingId&&lyricLinesArr.length>0)updateLyricFillProgress();requestAnimationFrame(lyricFillLoop)})();
domAudio.addEventListener('error',async function(){if(currentPlayingId&&audioRetryCount===0){var s=playlist.find(function(s){return s.id===currentPlayingId});if(s&&s.source==='netease'&&s.neteaseId){audioRetryCount++;showToast('链接过期，刷新中…','info',2000);var fr=await refreshSongUrl(s);if(fr){var eu=getEffectiveUrl(s);if(eu){domAudio.src=eu;domAudio.load();domAudio.play();audioRetryCount=0;return}}}audioRetryCount=0;showToast('音频加载失败','error',3500);isPlaying=false;updateUI()}});
function playNext(){if(!playlist.length||!currentPlayingId)return;var i=playlist.findIndex(function(s){return s.id===currentPlayingId});playSong(playlist[(i+1)%playlist.length].id)}
function playPrev(){if(!playlist.length||!currentPlayingId)return;var i=playlist.findIndex(function(s){return s.id===currentPlayingId});playSong(playlist[(i-1+playlist.length)%playlist.length].id)}

// Player bar controls
domBtnPlayPause.addEventListener('click',function(){if(currentPlayingId)togglePlayPause()});
domBtnPrev.addEventListener('click',function(){playPrev()});
domBtnNext.addEventListener('click',function(){playNext()});
domProgressBar.addEventListener('input',function(){var dur=domAudio.duration||0;if(dur>0)domAudio.currentTime=domProgressBar.value/100*dur});

// Export/Import
domBtnExport.addEventListener('click',function(){if(!playlist.length){showToast('歌单为空','warn');return}var ed=playlist.map(function(s){return{name:s.name,artist:s.artist,url:s.url,fav:s.fav,source:s.source||'url',neteaseId:s.neteaseId,albumArt:s.albumArt||''}});var b=new Blob([JSON.stringify(ed,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='claude-music-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);showToast('已导出 '+playlist.length+' 首')});
domBtnImport.addEventListener('click',function(){domImportFile.click()});
domImportFile.addEventListener('change',function(){var f=domImportFile.files[0];if(!f)return;var r=new FileReader();r.onload=function(e){try{var d=JSON.parse(e.target.result);if(!Array.isArray(d))throw new Error('格式错误');var c=0;d.forEach(function(it){if(it.name&&it.url){try{new URL(it.url)}catch(e){return}playlist.push({id:generateId(),name:it.name,artist:it.artist||'未知歌手',url:it.url,fav:!!it.fav,source:it.source||'url',neteaseId:it.neteaseId||null,albumArt:it.albumArt||''});c++}});if(c>0){savePlaylist();renderPlaylist();showToast('已导入 '+c+' 首')}else showToast('无有效歌曲','warn')}catch(err){showToast('解析失败','error')}};r.readAsText(f);domImportFile.value=''});

// Keyboard
document.addEventListener('keydown',function(e){if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;if(domModalImport.classList.contains('show'))return;if(e.key===' '){e.preventDefault();if(currentPlayingId)togglePlayPause()}else if(e.key==='ArrowRight'){e.preventDefault();playNext()}else if(e.key==='ArrowLeft'){e.preventDefault();playPrev()}});

// Netease login
async function startQrLogin(){if(qrLoginBusy)return;qrLoginBusy=true;stopQrPolling();try{domQrStatus.textContent='生成二维码中…';domQrStatus.className='qr-status';domQrRefresh.style.display='none';var kr=await neteaseApi('login_qr_key');qrKey=(kr.data&&kr.data.unikey)?kr.data.unikey:null;if(!qrKey)throw new Error('获取key失败');var qrR=await neteaseApi('login_qr_create',{key:qrKey,qrimg:true,platform:'web'});var qi=(qrR.data&&qrR.data.qrimg)?qrR.data.qrimg:'';if(qi){drawQr(qi);domQrStatus.textContent='请用网易云APP扫码';domQrStatus.className='qr-status';domQrRefresh.style.display='inline-block'}else throw new Error('无二维码');pollQrCheck()}catch(e){domQrStatus.textContent='失败: '+e.message;domQrStatus.className='qr-status fail';domQrRefresh.style.display='inline-block'}finally{qrLoginBusy=false}}
function drawQr(b64){var img=new Image();img.onload=function(){var ctx=domQrCanvas.getContext('2d');ctx.clearRect(0,0,160,160);ctx.fillStyle='#fff';ctx.fillRect(0,0,160,160);ctx.drawImage(img,0,0,160,160)};img.src=b64}
function pollQrCheck(){if(qrTimer)clearTimeout(qrTimer);qrTimer=setTimeout(async function(){try{var r=await neteaseApi('login_qr_check',{key:qrKey});var c=(r&&r.code)?r.code:0;if(c===803){domQrStatus.textContent='扫码成功！';domQrStatus.className='qr-status success';await onLoginSuccess(r.cookie||(r.body&&r.body.cookie)||'')}else if(c===802){domQrStatus.textContent='已扫码，请确认…'}else if(c===801){domQrStatus.textContent='等待扫码…'}else if(c===800){domQrStatus.textContent='二维码已过期';domQrStatus.className='qr-status fail';domQrRefresh.style.display='inline-block';qrKey=null;qrTimer=null;return}pollQrCheck()}catch(e){pollQrCheck()}},2000)}
function stopQrPolling(){if(qrTimer){clearTimeout(qrTimer);qrTimer=null}qrKey=null}
domQrRefresh.addEventListener('click',function(){startQrLogin()});
async function phoneLogin(){var p=domPhoneNumber.value.trim(),pw=domPhonePassword.value,cc=domPhoneCountry.value.trim()||'86';if(!p){showToast('请输入手机号','warn');return}if(!pw){showToast('请输入密码','warn');return}domBtnPhoneLogin.textContent='登录中…';domBtnPhoneLogin.disabled=true;try{var r=await neteaseApi('login_cellphone',{phone:p,password:pw,countrycode:cc},true);var c=r.cookie||(r.body&&r.body.cookie)||'';if(!c)throw new Error('未获取到凭证');await onLoginSuccess(c)}catch(e){showToast('登录失败: '+e.message,'error',4000)}finally{domBtnPhoneLogin.textContent='登录';domBtnPhoneLogin.disabled=false}}
domBtnPhoneLogin.addEventListener('click',phoneLogin);
domPhonePassword.addEventListener('keydown',function(e){if(e.key==='Enter')phoneLogin()});
async function onLoginSuccess(cookie){stopQrPolling();await setServerCookie(cookie);try{var d=await neteaseApi('login_status',{},true);if(d.data&&d.data.account&&d.data.profile)neteaseUser={userId:d.data.profile.userId,nickname:d.data.profile.nickname,avatarUrl:d.data.profile.avatarUrl};else throw new Error('获取用户信息失败')}catch(e){showToast('凭证已保存','warn');if(!neteaseUser)throw e}saveNeteaseUserCache();updateNeteaseUI();domPhonePassword.value='';domPhoneNumber.value='';showToast('登录成功: '+neteaseUser.nickname);setTimeout(function(){autoPopPlaylistImport()},800)}
async function autoPopPlaylistImport(){if(!neteaseUser)return;domModalImport.classList.add('show');domPlaylistList.innerHTML='<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3)">读取歌单…</div>';try{var d=await neteaseApi('user_playlist',{uid:neteaseUser.userId},true);var pls=d.playlist||[];if(!pls.length){domPlaylistList.innerHTML='<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3)">没有歌单</div>';return}domPlaylistList.innerHTML='<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">发现 '+pls.length+' 个歌单</div>';pls.forEach(function(pl){var card=document.createElement('div');card.className='playlist-card';card.innerHTML='<img class="pl-cover" src="'+(pl.coverImgUrl||'')+'" onerror="this.style.display=none">'+'<div class="pl-info"><div class="pl-name">'+escHtml(pl.name)+'</div><div class="pl-meta">'+(pl.trackCount||0)+' 首</div></div><span class="pl-arrow">→</span>';card.addEventListener('click',function(){importPlaylist(pl)});domPlaylistList.appendChild(card)})}catch(e){domPlaylistList.innerHTML='<div style="text-align:center;padding:30px;color:#f89">获取失败<br><small>'+e.message+'</small></div>'}}
async function importPlaylist(pl){domPlaylistList.innerHTML='<div class="import-progress"><div style="text-align:center;margin-bottom:10px;color:#ddd">导入: '+escHtml(pl.name)+'</div><div class="bar-track"><div class="bar-fill" id="importBar" style="width:0%"></div></div><div class="bar-text" id="importText">获取列表…</div></div>';try{var d=await neteaseApi('playlist_track_all',{id:pl.id},true);var tracks=d.songs||[];if(!tracks.length){showToast('歌单空','warn');return}var ids=tracks.map(function(t){return t.id});var ud=await neteaseApi('song_url',{id:ids.join(','),br:320000});var um={};(ud.data||[]).forEach(function(it){if(it.url)um[it.id]=it.url});var miss=ids.filter(function(id){return!um[id]});if(miss.length>0){try{var vd=await neteaseApi('song_url_v1',{id:miss.join(','),level:'lossless'});(vd.data||[]).forEach(function(it){if(it.url&&!um[it.id])um[it.id]=it.url})}catch(e){}}var imported=0,nc=0;for(var i=0;i<tracks.length;i++){var t=tracks[i],name=t.name||'未知歌曲',artist=(t.ar||[]).map(function(a){return a.name}).join('/')||'未知歌手',au=um[t.id]||'',nid=t.id,albumArt=(t.al&&t.al.picUrl)?t.al.picUrl:'';if(!au)nc++;if(!playlist.find(function(s){return s.neteaseId===nid})){playlist.push({id:generateId(),name:name,artist:artist,url:au,neteaseId:nid,source:'netease',fav:false,albumArt:albumArt});imported++}var bar=document.getElementById('importBar'),txt=document.getElementById('importText');if(bar)bar.style.width=Math.round((i+1)/tracks.length*100)+'%';if(txt)txt.textContent='导入中… '+(i+1)+'/'+tracks.length;fetchNeteaseLyrics(nid)}savePlaylist();renderPlaylist();var msg='导入 <b>'+imported+'</b> 首'+(nc>0?'（<span style="color:#fa4">'+nc+' 首暂无链接</span>）':'');domPlaylistList.innerHTML='<div style="text-align:center;padding:20px"><div style="font-size:28px;margin-bottom:8px">✅</div><div style="color:#ddd">'+msg+'</div></div>';showToast('已导入 '+imported+' 首: '+pl.name)}catch(e){domPlaylistList.innerHTML='<div style="text-align:center;padding:20px;color:#f89">导入失败<br><small>'+e.message+'</small></div>'}}
async function refreshAllSongUrls(){var broken=playlist.filter(function(s){return s.source==='netease'&&(!s.url||s.url==='null')});if(!broken.length){showToast('链接正常');return}showToast('刷新 '+broken.length+' 首…','info',3000);var fixed=0;for(var i=0;i<broken.length;i++){if(await refreshSongUrl(broken[i]))fixed++;if((i+1)%10===0)savePlaylist()}savePlaylist();renderPlaylist();showToast('修复 '+fixed+'/'+broken.length+' 首')}
async function neteaseConnect(){var raw=domNeteaseCookieInput.value.trim();if(!raw){showToast('请粘贴 cookie','warn');return}var mu=raw;if(raw.includes('=')){var m=raw.match(/MUSIC_U=([^;]+)/);if(m)mu=m[1]}var c='MUSIC_U='+mu+';appver=8.0.0;os=pc;';domBtnNeteaseConnect.textContent='连接中…';domBtnNeteaseConnect.disabled=true;try{await onLoginSuccess(c);domNeteaseCookieInput.value=''}catch(e){showToast('失败: '+e.message,'error',4000);await clearServerCookie()}finally{domBtnNeteaseConnect.textContent='连接';domBtnNeteaseConnect.disabled=false}}
async function neteaseLogout(){neteaseUser=null;saveNeteaseUserCache();await clearServerCookie();updateNeteaseUI();showToast('已断开')}
function updateNeteaseUI(){if(neteaseUser){domNeteaseLoginForm.style.display='none';domNeteaseUserPanel.style.display='block';domNeteaseNickname.textContent=neteaseUser.nickname;domNeteaseUid.textContent='UID: '+neteaseUser.userId;domNeteaseAvatar.src=neteaseUser.avatarUrl||'';domNeteaseAvatar.style.display=neteaseUser.avatarUrl?'block':'none';domNeteaseStatusHint.textContent='（已连接）';domNeteaseStatusHint.style.color='#ff8080';domBtnImportPlaylist.style.display='block';stopQrPolling()}else{domNeteaseLoginForm.style.display='block';domNeteaseUserPanel.style.display='none';domNeteaseStatusHint.textContent='（未连接）';domNeteaseStatusHint.style.color='rgba(255,255,255,.3)';domBtnImportPlaylist.style.display='none'}}
async function autoRestoreLogin(){await checkServerCookie();loadNeteaseUserCache();if(neteaseUser&&serverHasCookie){try{var d=await neteaseApi('login_status',{},true);if(d.data&&d.data.profile){neteaseUser={userId:d.data.profile.userId,nickname:d.data.profile.nickname,avatarUrl:d.data.profile.avatarUrl};saveNeteaseUserCache();stopQrPolling();qrKey=null;domQrStatus.textContent='已自动登录 ✓';domQrStatus.className='qr-status success'}else{neteaseUser=null;saveNeteaseUserCache()}}catch(e){neteaseUser=null;saveNeteaseUserCache()}}else if(!serverHasCookie){neteaseUser=null;saveNeteaseUserCache()}updateNeteaseUI()}
domBtnNeteaseConnect.addEventListener('click',neteaseConnect);domBtnNeteaseLogout.addEventListener('click',neteaseLogout);
domNeteaseCookieInput.addEventListener('keydown',function(e){if(e.key==='Enter')neteaseConnect()});
domNeteaseToggle.addEventListener('click',function(){neteaseOpen=!neteaseOpen;domNeteaseBody.style.display=neteaseOpen?'block':'none';if(neteaseOpen){domNeteaseToggle.classList.add('open');if(!neteaseUser&&!qrKey&&!qrTimer)startQrLogin()}else{domNeteaseToggle.classList.remove('open');stopQrPolling();qrKey=null}});
domTabQr.addEventListener('click',function(){domTabQr.classList.add('active');domTabPhone.classList.remove('active');domPanelQr.style.display='block';domPanelPhone.style.display='none';if(!qrKey&&!qrTimer)startQrLogin()});
domTabPhone.addEventListener('click',function(){domTabPhone.classList.add('active');domTabQr.classList.remove('active');domPanelQr.style.display='none';domPanelPhone.style.display='block';stopQrPolling();qrKey=null});
domBtnImportPlaylist.addEventListener('click',function(){if(!neteaseUser){showToast('请先连接网易云','warn');return}autoPopPlaylistImport()});
domBtnRefreshAllUrls.addEventListener('click',function(){refreshAllSongUrls()});
domBtnImportCancel.addEventListener('click',function(){domModalImport.classList.remove('show')});
domModalImport.addEventListener('click',function(e){if(e.target===domModalImport)domModalImport.classList.remove('show')});

// Init
async function init(){
  loadPlaylist();loadLyricsCache();renderPlaylist();updateNowPlaying();
  await autoRestoreLogin();
  setTimeout(async function(){
    var stale=playlist.filter(function(s){return s.source==='netease'&&s.neteaseId&&(!s.url||s.url==='null')});
    if(stale.length>0){var ok=0;for(var i=0;i<stale.length;i++){if(await refreshSongUrl(stale[i]))ok++}if(ok>0){savePlaylist();renderPlaylist()}}},3000);
  if(neteaseUser&&serverHasCookie){neteaseOpen=true;domNeteaseBody.style.display='block';domNeteaseToggle.classList.add('open')}
}
init();
})();
