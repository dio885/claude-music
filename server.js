/**
 * Claude Music Server
 * ───────────────────────────────────────────
 * 轻量 Express 后端，提供三个核心能力：
 * 1. 托管 music-player.html 静态页面
 * 2. 代理网易云音乐 API 请求（绕过 CORS）
 * 3. 代理音频流（绕过音频 CDN 跨域限制）
 *
 * 启动：node server.js
 * 访问：http://localhost:3000
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

// ============================================================
// 动态加载 NeteaseCloudMusicApi（兼容 v3 / v4 导出）
// ============================================================
let neteaseApi;
try {
  neteaseApi = require('NeteaseCloudMusicApi');
} catch (e) {
  console.error('[Server] ❌ 请先运行 npm install');
  process.exit(1);
}

// 构建 action → 函数 的映射表
// NeteaseCloudMusicApi v4 导出大量命名函数
const API_FN_MAP = {};
for (const key of Object.keys(neteaseApi)) {
  if (typeof neteaseApi[key] === 'function') {
    API_FN_MAP[key] = neteaseApi[key];
  }
}
console.log('[Server] 已加载 ' + Object.keys(API_FN_MAP).length + ' 个网易云 API 函数');

// ============================================================
// Express 初始化
// ============================================================
const app = express();
app.use(express.json({ limit: '2mb' }));

// 首页路由：直接返回 music-player.html
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'music-player.html'));
});

// 静态文件：当前目录下的所有文件（HTML / JS / CSS）
app.use(express.static(__dirname));

// ============================================================
// 服务器 Cookie 管理
// ============================================================
let serverCookie = ''; // 内存中的 MUSIC_U cookie

// 尝试从 config.json 恢复 cookie
const CONFIG_PATH = path.join(__dirname, 'config.json');
try {
  if (fs.existsSync(CONFIG_PATH)) {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    if (cfg.cookie) {
      serverCookie = cfg.cookie;
      console.log('[Server] 已从 config.json 恢复 cookie');
    }
  }
} catch (e) { /* ignore */ }

function saveCookieToDisk(cookie) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ cookie }, null, 2), 'utf-8');
  } catch (e) { /* ignore */ }
}

// ============================================================
// GET/POST /api/cookie  — 前端读取/设置 cookie
// ============================================================
app.get('/api/cookie', (_req, res) => {
  res.json({
    hasCookie: !!serverCookie,
    // 只返回掩码，不暴露完整 cookie
    preview: serverCookie
      ? serverCookie.slice(0, 20) + '…' + serverCookie.slice(-10)
      : ''
  });
});

app.post('/api/cookie', (req, res) => {
  const { cookie } = req.body;
  if (!cookie) {
    return res.status(400).json({ error: '缺少 cookie 字段' });
  }
  serverCookie = cookie;
  saveCookieToDisk(cookie);
  startTokenRefresh();
  console.log('[Server] Cookie 已更新 (' + cookie.length + ' 字符)');
  res.json({ ok: true });
});

app.delete('/api/cookie', (_req, res) => {
  serverCookie = '';
  stopTokenRefresh();
  try { fs.unlinkSync(CONFIG_PATH); } catch (e) { /* ignore */ }
  console.log('[Server] Cookie 已清除');
  res.json({ ok: true });
});

// ============================================================
// ALL /api/netease/:action  — 网易云 API 代理
// ============================================================
app.all('/api/netease/:action', async (req, res) => {
  const { action } = req.params;
  const fn = API_FN_MAP[action];

  if (!fn) {
    return res.status(404).json({
      error: '不支持的 API 操作: ' + action,
      hint: '可用的 action 如: login_status, user_playlist, playlist_track_all, song_url_v1, lyric_new'
    });
  }

  // 合并参数：body/query 参数 + 服务器 cookie
  const params = { ...req.query, ...req.body };
  const cookie = params.cookie || serverCookie;

  try {
    const result = await fn({ ...params, cookie });

    // NeteaseCloudMusicApi 返回 { status, body } 结构
    const body = result.body || result;
    res.json(body);
  } catch (err) {
    console.error('[Server] API 代理错误:', action, err.message);
    res.status(502).json({
      error: 'API 代理请求失败',
      message: err.message,
      action
    });
  }
});

// ============================================================
// GET /stream  — 音频流代理（绕过 CDN 跨域）
// 支持 Range 请求以实现音频 seek
// ============================================================
app.get('/stream', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: '缺少 url 参数' });
  }

  try {
    // 先发 HEAD 获取文件信息
    const headRes = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/'
      }
    });

    const fileSize = parseInt(headRes.headers.get('content-length') || '0');
    const contentType = headRes.headers.get('content-type') || 'audio/mpeg';
    const acceptRanges = headRes.headers.get('accept-ranges') || 'bytes';

    // 通用响应头
    res.set('Content-Type', contentType);
    res.set('Accept-Ranges', 'bytes');
    res.set('Access-Control-Allow-Origin', '*');

    const rangeHeader = req.headers.range;

    if (rangeHeader && fileSize > 0) {
      // ── Range 请求（seek 时浏览器发送） ──
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const fetchRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://music.163.com/',
          'Range': `bytes=${start}-${end}`
        }
      });

      res.status(206);
      res.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.set('Content-Length', chunkSize);

      const buffer = Buffer.from(await fetchRes.arrayBuffer());
      res.send(buffer);
    } else {
      // ── 完整请求 ──
      const fetchRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://music.163.com/'
        }
      });

      if (fileSize > 0) {
        res.set('Content-Length', fileSize);
      }

      const buffer = Buffer.from(await fetchRes.arrayBuffer());
      res.send(buffer);
    }
  } catch (err) {
    console.error('[Server] 音频流代理失败:', err.message);
    res.status(502).json({
      error: '音频流代理失败',
      message: err.message
    });
  }
});

// ============================================================
// Token 自动续期
// ============================================================
let refreshTimer = null;

async function refreshLoginToken() {
  if (!serverCookie || !API_FN_MAP['login_refresh']) return;
  try {
    const result = await API_FN_MAP['login_refresh']({ cookie: serverCookie });
    if (result.body && result.body.code === 200) {
      // 更新内存中的 cookie
      const newCookie = result.body.cookie || (result.cookie && result.cookie.join(';')) || '';
      if (newCookie) {
        serverCookie = newCookie;
        saveCookieToDisk(newCookie);
        console.log('[Server] 🔄 Token 已自动续期 (' + new Date().toLocaleString('zh-CN') + ')');
      }
    } else {
      console.warn('[Server] Token 续期失败: code=' + (result.body && result.body.code));
    }
  } catch (e) {
    console.warn('[Server] Token 续期异常:', e.message);
  }
}

function startTokenRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  // 每 2 小时续期一次
  refreshTimer = setInterval(refreshLoginToken, 2 * 60 * 60 * 1000);
  console.log('[Server] 🔄 Token 自动续期已启动（每2小时）');
}

function stopTokenRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

// ============================================================
// 初始化 + 启动服务器
// ============================================================
const tmpPath = require('os').tmpdir();
const anonymousTokenPath = path.join(tmpPath, 'anonymous_token');

async function boot() {
  // 1. 创建 anonymous_token 空文件（NeteaseCloudMusicApi 依赖）
  if (!fs.existsSync(anonymousTokenPath)) {
    fs.writeFileSync(anonymousTokenPath, '', 'utf-8');
  }

  // 2. 预注册匿名设备——设置 global.cnIp + global.deviceId + 写入 MUSIC_A
  try {
    const generateConfig = require('NeteaseCloudMusicApi/generateConfig');
    await generateConfig();
    console.log('[Server] 匿名设备已注册');
  } catch (e) {
    console.warn('[Server] 匿名设备注册失败（非致命）:', e.message);
  }

  // 3. 启动 HTTP 服务
  const PORT = process.env.PORT || 4567;
  app.listen(PORT, () => {
    console.log('');
    console.log('  🎵 Claude Music Server 已启动');
    console.log('  ────────────────────────────');
    console.log('  地址: http://localhost:' + PORT);
    console.log('  ────────────────────────────');
    console.log('');
    console.log('  登录方式：');
    console.log('  1. 📱 扫码：展开网易云面板 → 扫描二维码');
    console.log('  2. 🔑 账号：展开网易云面板 → 切换账号登录 → 输入手机号密码');
    console.log('');
  });

  // 4. 自动刷新令牌（每 2 小时续期一次，防止 MUSIC_U 过期）
  if (serverCookie) {
    startTokenRefresh();
  }
}

boot();
