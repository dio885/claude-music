/**
 * Build music-player.html from:
 *   1. HTML template (embedded below)
 *   2. app.js (the frontend logic)
 *
 * Usage: node build.js
 */

const fs = require('fs');
const path = require('path');

// ── Read JS from app.js ──
let appJs;
try {
  appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8').trim();
  new Function(appJs);
  console.log('[build] app.js syntax OK (' + appJs.length + ' chars)');
} catch (e) {
  console.error('[build] app.js syntax ERROR:', e.message.substring(0, 300));
  process.exit(1);
}

// ── HTML Template ──
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Claude Music</title>
<style>
:root{--bg-deep:#0a0a0f;--panel-bg:rgba(20,20,35,.55);--panel-border:rgba(255,255,255,.08);--text-primary:#e8e8f0;--text-secondary:#9999aa;--accent:#7c6ff7;--accent-hover:#9b8fff;--row-hover:rgba(124,111,247,.12);--row-active:rgba(124,111,247,.22);--danger:#e0556a;--netease-red:#ec4141;--radius:18px;--blur-strength:20px;--f:.15s ease;--s:.3s ease}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#06060d;color:var(--text-primary);width:100vw;height:100vh;overflow:hidden;user-select:none;-webkit-user-select:none;position:relative}
#bgCanvas,#lyricParticleCanvas{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none}
#lyricParticleCanvas{z-index:5}

/* ===== 歌词背景层 —— 专辑封面 ===== */
.lyric-bg-wrapper{position:fixed;inset:0;z-index:2;pointer-events:none;display:none;align-items:center;justify-content:center}
.lyric-bg-wrapper.show{display:flex}
.lyric-bg-image{position:absolute;width:70vmin;height:70vmin;max-width:750px;max-height:750px;min-width:300px;min-height:300px;object-fit:cover;border-radius:28px;top:50%;left:50%;transform:translate(-50%,-50%);transition:opacity 1s cubic-bezier(.4,0,.2,1),transform 1.2s cubic-bezier(.4,0,.2,1);box-shadow:0 0 120px rgba(0,0,0,.5)}
.lyric-bg-image.fade-out{opacity:0;transform:translate(-50%,-50%) scale(1.08)}
.lyric-bg-image.fade-in{opacity:.75;transform:translate(-50%,-50%) scale(1)}
.lyric-bg-overlay{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(6,6,13,.35) 0%,rgba(6,6,13,.75) 70%,rgba(6,6,13,.92) 100%)}

/* ===== 桌面歌词悬浮面板 ===== */
.center-lyrics{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:6;pointer-events:none;display:none}
.center-lyrics.show{display:block}

/* 胶囊形毛玻璃面板 */
.lyric-glass-panel{position:relative;display:inline-block;padding:40px 64px;border-radius:48px;background:rgba(0,0,0,.5);backdrop-filter:blur(10px) saturate(1.4);-webkit-backdrop-filter:blur(10px) saturate(1.4);border:1px solid rgba(255,255,255,.1);box-shadow:0 2px 0 rgba(255,255,255,.05) inset,0 32px 96px rgba(0,0,0,.55),0 8px 24px rgba(0,0,0,.35);transition:opacity .5s;animation:panelEnter .55s cubic-bezier(.23,1,.32,1) both;max-width:90vw;min-width:280px;text-align:center}
@keyframes panelEnter{from{opacity:0;transform:translateY(18px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}

/* 歌词行栈 */
.lyric-lines-stack{display:flex;flex-direction:column;align-items:center;gap:12px}

/* 通用歌词行 */
.lyric-line{font-family:'Inter','SF Pro Display','Source Han Sans SC','Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;font-weight:400;letter-spacing:.05em;line-height:1.5;white-space:nowrap;display:block;position:relative}

/* 偏远行 */
.lyric-line.far-before,.lyric-line.far-after{font-size:16px;color:rgba(255,255,255,.08);font-weight:300}
/* 相邻行 */
.lyric-line.near-before,.lyric-line.near-after{font-size:20px;color:rgba(255,255,255,.18);font-weight:400}
/* 当前行 */
.lyric-line.current{font-size:46px;font-weight:700;letter-spacing:.06em;color:#fff;text-shadow:0 0 20px rgba(255,255,255,.4),0 0 60px rgba(180,160,255,.25)}

/* 逐单词 */
.lyric-word{display:inline-block;transition:color .12s ease-out,text-shadow .12s ease-out;margin:0 .08em}
.lyric-word.pending{color:rgba(255,255,255,.22);text-shadow:none}
.lyric-word.passed{color:#00e0f0;text-shadow:0 0 8px rgba(0,224,240,.3)}
.lyric-word.active{color:#fff;text-shadow:0 0 6px rgba(255,255,255,.9),0 0 18px rgba(255,255,255,.5),0 0 36px rgba(0,240,255,.7);animation-name:wordPulse;animation-timing-function:ease-in-out;animation-iteration-count:infinite}
@keyframes wordPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}

/* 非当前行 */
.lyric-line:not(.current){color:rgba(255,255,255,.1)}

/* 无歌词 */
.lyric-glass-panel .no-lyrics{font-size:17px;color:rgba(255,255,255,.15);letter-spacing:.1em;font-family:'Inter','PingFang SC','Microsoft YaHei',sans-serif;font-weight:300}

.left-zone{position:fixed;left:50px;top:40px;z-index:10;max-width:380px}
.now-playing-area{pointer-events:none}
.now-playing-label{font-size:11px;text-transform:uppercase;letter-spacing:5px;color:var(--text-secondary);margin-bottom:10px;font-weight:500}
.now-playing-title{font-size:28px;font-weight:700;color:#fff;line-height:1.3;text-shadow:0 0 40px rgba(180,170,255,.3);word-break:break-word;transition:all .5s}
.now-playing-artist{font-size:16px;color:var(--text-secondary);margin-top:4px;transition:all .5s}
.now-playing-placeholder{font-size:14px;color:rgba(255,255,255,.2);letter-spacing:2px}
.play-indicator{display:inline-flex;align-items:center;gap:8px;margin-top:16px}
.play-indicator .dot{width:7px;height:7px;border-radius:50%;background:#7c6ff7;animation:pulse-dot 1.2s infinite}
.play-indicator .dot.paused{animation-play-state:paused;background:#555}
@keyframes pulse-dot{0%,100%{opacity:1;box-shadow:0 0 10px #7c6ff7}50%{opacity:.3;box-shadow:0 0 3px #7c6ff7}}

/* ===== 播放控制条 ===== */
.player-bar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:15;background:rgba(14,14,30,.7);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:16px 28px;display:flex;flex-direction:column;gap:12px;min-width:460px;max-width:680px;box-shadow:0 -2px 30px rgba(0,0,0,.45),0 12px 48px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.03)}
/* 进度条行 */
.player-bar .pb-row{display:flex;align-items:center;gap:14px}
.player-bar .pb-time{font-size:14px;font-weight:500;color:#eee;letter-spacing:.5px;font-variant-numeric:tabular-nums;min-width:44px;text-align:center}
.player-bar .pb-time-left{text-align:right}
/* 进度条容器 — 暗轨 + 高亮覆盖 */
.player-bar .pb-track-wrap{flex:1;position:relative;height:22px;display:flex;align-items:center;cursor:pointer}
.player-bar .pb-track-bg{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
.player-bar .pb-track-fill{position:absolute;left:0;top:0;height:100%;border-radius:3px;background:linear-gradient(90deg,#8B5CF6,#6366F1,#06B6D4);width:0%;transition:width .05s linear}
.player-bar .pb-track-loading{position:absolute;left:0;top:0;height:100%;width:100%;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.2) 40%,rgba(255,255,255,.2) 60%,transparent 100%);animation:pbShimmer 1.8s infinite;display:none}
@keyframes pbShimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.player-bar input[type=range]{-webkit-appearance:none;appearance:none;position:absolute;inset:0;width:100%;height:100%;background:transparent;outline:none;cursor:pointer;z-index:1;margin:0}
.player-bar input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;margin-top:-5px;border-radius:50%;background:#fff;border:3px solid #8B5CF6;box-shadow:0 0 2px rgba(0,0,0,.3),0 0 12px rgba(139,92,246,.5),0 0 24px rgba(139,92,246,.2);cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;position:relative;z-index:2}
.player-bar input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.2);box-shadow:0 0 4px rgba(0,0,0,.3),0 0 18px rgba(139,92,246,.7),0 0 36px rgba(139,92,246,.3)}
.player-bar input[type=range]::-webkit-slider-thumb:active{transform:scale(1.05)}
/* Firefox */
.player-bar input[type=range]::-moz-range-track{background:transparent;border:none}
.player-bar input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #8B5CF6;box-shadow:0 0 12px rgba(139,92,246,.5);cursor:pointer}
/* 按钮行 */
.player-bar .pb-btn-row{display:flex;align-items:center;justify-content:center;gap:20px}
/* 上一首/下一首 */
.pb-btn-side{width:40px;height:40px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,.7);cursor:pointer;font-size:18px;display:inline-flex;align-items:center;justify-content:center;transition:all .2s ease}
.pb-btn-side:hover{color:#fff;background:rgba(255,255,255,.08);transform:scale(1.08)}
.pb-btn-side:active{transform:scale(.95)}
/* 核心播放/暂停 — 大按钮，渐变背景 */
.pb-btn-main{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;font-size:22px;display:inline-flex;align-items:center;justify-content:center;transition:all .25s ease;position:relative}
.pb-btn-main::after{content:'';position:absolute;inset:-4px;border-radius:50%;background:rgba(139,92,246,.15);z-index:-1;transition:all .25s ease}
.pb-btn-main.playing{background:linear-gradient(135deg,#8B5CF6,#6366F1);color:#fff;box-shadow:0 4px 24px rgba(139,92,246,.4),0 8px 48px rgba(99,102,241,.25)}
.pb-btn-main.playing:hover{transform:scale(1.08);box-shadow:0 4px 30px rgba(139,92,246,.55),0 12px 56px rgba(99,102,241,.35)}
.pb-btn-main.playing:hover::after{inset:-8px;background:rgba(139,92,246,.2)}
.pb-btn-main.playing:active{transform:scale(.94)}
.pb-btn-main.paused{background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);border:1.5px solid rgba(255,255,255,.15);box-shadow:0 2px 12px rgba(0,0,0,.2)}
.pb-btn-main.paused:hover{background:rgba(139,92,246,.2);color:#fff;border-color:rgba(139,92,246,.4);transform:scale(1.08);box-shadow:0 4px 24px rgba(139,92,246,.25)}
.pb-btn-main.paused:hover::after{inset:-8px;background:rgba(139,92,246,.08)}
.pb-btn-main.paused:active{transform:scale(.94)}
.playlist-panel{position:fixed;right:30px;top:50%;transform:translateY(-50%);width:440px;max-height:82vh;background:var(--panel-bg);backdrop-filter:blur(var(--blur-strength));-webkit-backdrop-filter:blur(var(--blur-strength));border:1px solid var(--panel-border);border-radius:var(--radius);z-index:10;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.04);overflow:hidden}
.panel-header{padding:22px 24px 16px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}
.panel-title{font-size:20px;font-weight:700;letter-spacing:1.5px;color:#fff;display:flex;align-items:center;gap:10px}
.panel-title .icon-heart{font-size:20px;color:var(--accent)}
.song-count{font-size:12px;color:var(--text-secondary);letter-spacing:1px;margin-top:4px}
.netease-section{padding:10px 24px;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
.netease-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-secondary);letter-spacing:1px;padding:6px 0;transition:color var(--f)}
.netease-toggle:hover{color:#fff}
.netease-toggle .arrow{font-size:10px;transition:transform var(--f)}
.netease-toggle.open .arrow{transform:rotate(90deg)}
.netease-body{padding:8px 0}
.netease-body .row{display:flex;gap:8px;margin-bottom:8px;align-items:center}
.netease-body input{flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#ddd;font-size:12px;outline:none;font-family:inherit;transition:border var(--f)}
.netease-body input::placeholder{color:rgba(255,255,255,.2);font-size:11px}
.netease-body input:focus{border-color:var(--accent)}
.netease-user-info{display:flex;align-items:center;gap:10px;padding:6px 0}
.netease-avatar{width:32px;height:32px;border-radius:50%;border:2px solid var(--netease-red)}
.netease-nickname{font-size:13px;color:#fff;font-weight:600}
.netease-uid{font-size:10px;color:var(--text-secondary)}
.login-tabs{display:flex;margin-bottom:10px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.08)}
.login-tab{flex:1;padding:7px 0;text-align:center;cursor:pointer;font-size:12px;letter-spacing:1px;background:transparent;color:var(--text-secondary);border:none;transition:all var(--f);font-family:inherit}
.login-tab.active{background:rgba(255,255,255,.08);color:#fff}
.qr-wrap{text-align:center;padding:8px 0}
.qr-canvas{border-radius:10px;background:#fff;padding:8px;width:160px;height:160px}
.qr-status{font-size:11px;color:var(--text-secondary);margin-top:8px;letter-spacing:.5px}
.qr-status.success{color:#4ecb71}.qr-status.fail{color:var(--danger)}
.qr-refresh{font-size:10px;color:var(--accent);cursor:pointer;margin-top:4px;display:inline-block;text-decoration:underline;background:none;border:none;font-family:inherit}
.qr-refresh:hover{color:var(--accent-hover)}
.phone-login-form{display:flex;flex-direction:column;gap:8px}
.phone-row{display:flex;gap:6px;align-items:center}
.phone-row .country-code{width:50px;padding:8px 6px;border-radius:8px;text-align:center;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#ddd;font-size:12px;font-family:inherit}
.btn{padding:10px 16px;border-radius:10px;border:none;cursor:pointer;font-size:13px;font-weight:600;letter-spacing:.5px;transition:all var(--f);white-space:nowrap;font-family:inherit}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:var(--accent-hover);transform:translateY(-1px);box-shadow:0 6px 20px rgba(124,111,247,.35)}
.btn-outline{background:transparent;color:#ccc;border:1px solid rgba(255,255,255,.18)}
.btn-outline:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.35);color:#fff}
.btn-sm{font-size:11px;padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-weight:600;letter-spacing:.5px;transition:all var(--f);font-family:inherit}
.btn-sm-primary{background:var(--netease-red);color:#fff}
.btn-sm-primary:hover{background:#ff5a5a;transform:translateY(-1px)}
.btn-sm-outline{background:transparent;color:#aaa;border:1px solid rgba(255,255,255,.15)}
.btn-sm-outline:hover{background:rgba(255,255,255,.06);color:#fff}
.btn-import-netease{display:block;width:100%;margin-top:8px;font-size:12px;padding:9px;border-radius:8px;border:1px dashed rgba(236,65,65,.4);background:rgba(236,65,65,.06);color:#ff8080;cursor:pointer;letter-spacing:1px;transition:all var(--f);font-family:inherit}
.btn-import-netease:hover{background:rgba(236,65,65,.15);border-color:var(--netease-red);color:#fff}
.btn-icon{width:32px;height:32px;padding:0;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:16px;display:inline-flex;align-items:center;justify-content:center;transition:all var(--f);flex-shrink:0}
.btn-icon:hover{background:rgba(255,255,255,.08);color:#fff}
.btn-icon.play-btn:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-icon.fav-btn.active{color:#ff6b8a}
.toolbar{padding:10px 24px;display:flex;gap:8px;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
.toolbar .btn{font-size:11px;padding:7px 13px;border-radius:8px;letter-spacing:.8px}
.song-list-scroll{flex:1;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent}
.song-list-scroll::-webkit-scrollbar{width:4px}
.song-list-scroll::-webkit-scrollbar-track{background:transparent}
.song-list-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}
.song-list{list-style:none;padding:8px 12px}
.song-row{display:flex;align-items:center;padding:10px 12px;border-radius:10px;cursor:pointer;transition:background var(--f);gap:6px;margin-bottom:2px}
.song-row:hover{background:var(--row-hover)}
.song-row.active{background:var(--row-active);box-shadow:inset 3px 0 0 var(--accent)}
.song-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.song-name{font-size:14px;font-weight:600;color:#e0e0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.song-row.active .song-name{color:#fff}
.song-artist{font-size:11px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.song-source-tag{font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(236,65,65,.2);color:#ff8080;letter-spacing:.5px;flex-shrink:0;margin-right:2px}
.song-actions{display:flex;gap:2px;flex-shrink:0;opacity:.5;transition:opacity var(--f)}
.song-row:hover .song-actions,.song-row.active .song-actions{opacity:1}
.empty-hint{text-align:center;padding:40px 20px;color:rgba(255,255,255,.2);font-size:14px;letter-spacing:1px}
.panel-footer{padding:6px 16px;border-top:1px solid rgba(255,255,255,.04);flex-shrink:0;font-size:10px;color:var(--text-secondary);text-align:center}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity var(--s)}
.modal-overlay.show{opacity:1;pointer-events:auto}
.modal-box{background:rgba(30,30,50,.92);backdrop-filter:blur(30px);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius);padding:28px;width:420px;max-width:90vw;max-height:80vh;box-shadow:0 30px 60px rgba(0,0,0,.6);transform:translateY(10px);transition:transform var(--s);display:flex;flex-direction:column}
.modal-overlay.show .modal-box{transform:translateY(0)}
.modal-box.wide{width:520px}
.modal-title{font-size:17px;font-weight:700;margin-bottom:20px;color:#fff;letter-spacing:1px;flex-shrink:0}
.modal-body-scroll{flex:1;overflow-y:auto;margin:-8px -8px 0;padding:8px 8px 0;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.08) transparent}
.modal-body-scroll::-webkit-scrollbar{width:3px}
.modal-body-scroll::-webkit-scrollbar-track{background:transparent}
.modal-body-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:3px}
.modal-field{margin-bottom:14px}
.modal-field label{display:block;font-size:12px;color:var(--text-secondary);margin-bottom:5px;letter-spacing:.5px}
.modal-field input,.modal-field textarea{width:100%;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#ddd;font-size:14px;outline:none;font-family:inherit;transition:border var(--f)}
.modal-field input:focus,.modal-field textarea:focus{border-color:var(--accent)}
.modal-field textarea{resize:vertical;min-height:160px;line-height:1.8;font-size:13px}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px;flex-shrink:0}
.playlist-card{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;cursor:pointer;border:1px solid transparent;transition:all var(--f);margin-bottom:4px}
.playlist-card:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)}
.playlist-card .pl-cover{width:48px;height:48px;border-radius:8px;background:rgba(255,255,255,.05);flex-shrink:0;object-fit:cover}
.playlist-card .pl-info{flex:1;min-width:0}
.playlist-card .pl-name{font-size:14px;font-weight:600;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.playlist-card .pl-meta{font-size:11px;color:var(--text-secondary);margin-top:2px}
.playlist-card .pl-arrow{color:var(--text-secondary);font-size:14px;transition:color var(--f)}
.playlist-card:hover .pl-arrow{color:#fff}
.import-progress{padding:10px 0}
.import-progress .bar-track{height:4px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden;margin-bottom:6px}
.import-progress .bar-fill{height:100%;border-radius:2px;background:var(--netease-red);transition:width var(--s)}
.import-progress .bar-text{font-size:11px;color:var(--text-secondary)}
.toast{position:fixed;top:30px;left:50%;transform:translateX(-50%) translateY(-20px);background:rgba(30,30,50,.9);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.1);color:#fff;padding:12px 24px;border-radius:10px;font-size:13px;z-index:200;opacity:0;pointer-events:none;transition:all var(--s);letter-spacing:.5px}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast.warn{border-color:rgba(255,180,80,.4);color:#fc8}
.toast.error{border-color:rgba(224,85,106,.4);color:#f89}
@media(max-width:900px){
  .left-zone{left:20px;top:20px;max-width:220px}
  .now-playing-title{font-size:20px}
  .lyric-glass-panel{padding:28px 40px;border-radius:36px;max-width:88vw;min-width:220px}
  .lyric-line.current{font-size:34px}
  .lyric-line.near-before,.lyric-line.near-after{font-size:16px}
  .lyric-line.far-before,.lyric-line.far-after{font-size:13px}
  .lyric-bg-image{width:80vmin;height:80vmin;max-width:500px;max-height:500px}
  .playlist-panel{right:10px;width:340px;max-height:75vh;border-radius:14px}
  .player-bar{min-width:auto;max-width:calc(100vw - 40px);padding:12px 20px;gap:10px}
  .player-bar .pb-time{font-size:12px;min-width:36px}
  .pb-btn-main{width:48px;height:48px;font-size:20px}
  .pb-btn-side{width:36px;height:36px;font-size:16px}
}
@media(max-width:640px){
  .left-zone{position:relative;left:auto;top:auto;max-width:100%;padding:16px 16px 0;text-align:center}
  .lyric-glass-panel{padding:18px 20px;border-radius:28px;max-width:92vw;min-width:auto}
  .lyric-line.current{font-size:24px}
  .lyric-line.near-before,.lyric-line.near-after{font-size:13px}
  .lyric-line.far-before,.lyric-line.far-after{font-size:10px}
  .lyric-bg-image{width:90vmin;height:90vmin;max-width:350px;max-height:350px;min-width:200px;min-height:200px}
  .playlist-panel{right:auto;top:auto;transform:none;width:calc(100% - 16px);margin:0 8px;max-height:45vh;position:relative}
  .player-bar{border-radius:20px;padding:10px 14px;min-width:auto;max-width:calc(100vw - 16px);gap:8px}
  .player-bar .pb-time{font-size:11px;min-width:32px}
  .player-bar .pb-row{gap:8px}
  .pb-btn-main{width:44px;height:44px;font-size:18px}
  .pb-btn-side{width:32px;height:32px;font-size:14px}
  .player-bar .pb-btn-row{gap:12px}
}
</style>
</head>
<body>
<canvas id="bgCanvas"></canvas>

<!-- ===== 专辑封面背景层 ===== -->
<div class="lyric-bg-wrapper" id="lyricBgWrapper">
  <img class="lyric-bg-image fade-out" id="lyricBgImgA" src="" alt="" crossorigin="anonymous">
  <img class="lyric-bg-image fade-out" id="lyricBgImgB" src="" alt="" crossorigin="anonymous">
  <div class="lyric-bg-overlay"></div>
</div>

<canvas id="lyricParticleCanvas"></canvas>

<div class="left-zone"><div class="now-playing-area"><div class="now-playing-label">♪ 正在播放</div><div class="now-playing-title" id="nowTitle"><span class="now-playing-placeholder">未选择歌曲</span></div><div class="now-playing-artist" id="nowArtist"></div><div class="play-indicator" id="playIndicator" style="display:none"><span class="dot paused" id="indicatorDot"></span><span style="font-size:10px;color:#888" id="indicatorText">已暂停</span></div></div></div>

<div class="center-lyrics" id="centerLyrics">
  <div class="lyric-glass-panel">
    <div class="lyric-lines-stack" id="lyricLinesStack"></div>
  </div>
</div>

<div class="player-bar" id="playerBar">
  <div class="pb-row">
    <span class="pb-time" id="timeCurrent">0:00</span>
    <div class="pb-track-wrap">
      <div class="pb-track-bg">
        <div class="pb-track-fill" id="pbTrackFill"></div>
        <div class="pb-track-loading" id="pbTrackLoading"></div>
      </div>
      <input type="range" id="progressBar" min="0" max="100" value="0">
    </div>
    <span class="pb-time pb-time-left" id="timeDuration">0:00</span>
  </div>
  <div class="pb-btn-row">
    <button class="pb-btn-side" id="btnPrev" title="上一首">⏮</button>
    <button class="pb-btn-main paused" id="btnPlayPause" title="播放 / 暂停">▶</button>
    <button class="pb-btn-side" id="btnNext" title="下一首">⏭</button>
  </div>
</div>

<div class="playlist-panel"><div class="panel-header"><div class="panel-title"><span class="icon-heart">♥</span> 我喜欢的音乐</div><div class="song-count" id="songCount">共 0 首</div></div><div class="netease-section"><div class="netease-toggle" id="neteaseToggle"><span class="arrow">▶</span> 🔴 网易云音乐 <span id="neteaseStatusHint" style="font-size:10px;color:rgba(255,255,255,.3)">（未连接）</span></div><div class="netease-body" id="neteaseBody" style="display:none"><div id="neteaseLoginForm"><div class="login-tabs"><button class="login-tab active" id="tabQr">📱 扫码登录</button><button class="login-tab" id="tabPhone">🔑 账号登录</button></div><div id="panelQr" class="qr-wrap"><canvas class="qr-canvas" id="qrCanvas" width="160" height="160"></canvas><div class="qr-status" id="qrStatus">点击展开以生成二维码…</div><button class="qr-refresh" id="qrRefresh" style="display:none">🔄 重新生成</button></div><div id="panelPhone" class="phone-login-form" style="display:none"><div class="phone-row"><span style="font-size:11px;color:var(--text-secondary)">+</span><input class="country-code" value="86" id="phoneCountry" placeholder="86" autocomplete="off"><input type="tel" id="phoneNumber" placeholder="手机号" autocomplete="off" style="flex:1"></div><div class="row"><input type="password" id="phonePassword" placeholder="密码" autocomplete="off" style="flex:1"></div><button class="btn-sm btn-sm-primary" id="btnPhoneLogin" style="width:100%">登录</button></div><details style="margin-top:8px;font-size:10px;color:rgba(255,255,255,.15)"><summary style="cursor:pointer">⚙ 手动粘贴 Cookie（高级）</summary><div class="row" style="margin-top:6px"><input type="password" id="neteaseCookieInput" placeholder="MUSIC_U cookie…" autocomplete="off"><button class="btn-sm btn-sm-outline" id="btnNeteaseConnect">连接</button></div></details></div><div id="neteaseUserPanel" style="display:none"><div class="netease-user-info"><img class="netease-avatar" id="neteaseAvatar" src="" alt=""><div><div class="netease-nickname" id="neteaseNickname">--</div><div class="netease-uid" id="neteaseUid"></div></div><button class="btn-sm btn-sm-outline" id="btnNeteaseLogout" style="margin-left:auto">退出</button></div><button class="btn-import-netease" id="btnImportPlaylist">📥 导入网易云歌单</button><button class="btn-import-netease" id="btnRefreshAllUrls" style="border-color:rgba(124,111,247,.3);color:#aaa4ff;background:rgba(124,111,247,.05);margin-top:6px">🔄 刷新全部播放链接</button></div></div></div><div class="toolbar"><button class="btn btn-outline" id="btnExport">📥 导出歌单</button><button class="btn btn-outline" id="btnImport">📤 导入歌单</button><input type="file" id="importFileInput" accept=".json" style="display:none"></div><div class="song-list-scroll"><ul class="song-list" id="songList"><li class="empty-hint">还没有歌曲，连接网易云导入吧 🎵</li></ul></div><div class="panel-footer"></div></div>

<div class="modal-overlay" id="modalImportPlaylist"><div class="modal-box wide"><div class="modal-title">🎧 选择歌单导入</div><div class="modal-body-scroll" id="playlistList"><div style="text-align:center;padding:30px;color:rgba(255,255,255,.3)">加载中…</div></div><div class="modal-actions"><button class="btn btn-outline" id="btnImportCancel">关闭</button></div></div></div>

<div class="toast" id="toast"></div>
<audio id="audioPlayer" preload="auto"></audio>
`;

// ── Build final file ──
const final = HTML + '\n<script>\n' + appJs + '\n</script>\n</body>\n</html>';

// Validate
const m = final.match(/<script>([\s\S]*?)<\/script>/);
if (m) {
  try {
    new Function(m[1]);
    console.log('[build] JS validation OK');
  } catch(e) {
    console.error('[build] JS syntax ERROR:', e.message.substring(0, 300));
    process.exit(1);
  }
}

fs.writeFileSync(path.join(__dirname, 'music-player.html'), final, 'utf-8');
console.log('[build] music-player.html written: ' + final.length + ' chars');
