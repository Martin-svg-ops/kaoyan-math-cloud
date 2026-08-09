'use strict';
/*
 * 研数工坊 —— 云端多用户后端
 * 纯 Node.js（无第三方依赖）：登录/注册、按用户隔离题库、独立管理者账号。
 * 同时托管前端静态文件（同域，免 CORS）。
 *
 * 启动： node server.js   （或 npm start）
 * 环境变量： PORT（默认 3000）、ADMIN_USER（默认 admin）、ADMIN_PASSWORD（默认 admin123）
 * 数据：  ./server-data/db.json（自动创建；含用户、会话、各用户题库增删差异）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'server-data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BANK_FILE = path.join(ROOT, 'data', '880数一基础篇.js');

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- 基础题库（共享，只读） ---------- */
function loadBaseBank() {
  try {
    const raw = fs.readFileSync(BANK_FILE, 'utf8');
    const json = raw.replace(/^window\.__preloadedBank880\s*=\s*/, '').replace(/;\s*$/, '');
    const bank = JSON.parse(json);
    const preBank = bank.bank || { id: 'bank_880', name: '880数一基础篇' };
    const questions = (bank.questions || []).map((q) => Object.assign({}, q, { bankId: preBank.id }));
    // 保证基础字段完整
    questions.forEach((q) => {
      q.options = Array.isArray(q.options) ? q.options : [];
      q.deleted = false;
    });
    return { bankMeta: preBank, questions };
  } catch (e) {
    console.error('[server] 加载基础题库失败：', e);
    return { bankMeta: { id: 'bank_880', name: '880数一基础篇' }, questions: [] };
  }
}
const BASE = loadBaseBank();

/* ---------- 持久化 ---------- */
let db = { users: [], sessions: {}, seq: {} };
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = Object.assign({ users: [], sessions: {}, seq: {} }, d);
    }
  } catch (e) { console.error('[server] 读取数据库失败：', e); }
}
function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
  catch (e) { console.error('[server] 写入数据库失败：', e); }
}
loadDB();

/* ---------- 密码与令牌 ---------- */
function hashPW(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPW(pw, salt, hash) {
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash)); }
  catch (e) { return false; }
}
function newToken() { return crypto.randomBytes(32).toString('hex'); }
function newSeq(prefix) { db.seq[prefix] = (db.seq[prefix] || 0) + 1; return prefix + '_' + db.seq[prefix] + '_' + crypto.randomBytes(3).toString('hex'); }

/* ---------- 种子管理者账号 ---------- */
function seedAdmin() {
  if (!db.users.some((u) => u.isAdmin)) {
    const username = process.env.ADMIN_USER || 'admin';
    const pw = process.env.ADMIN_PASSWORD || 'admin123';
    const { salt, hash } = hashPW(pw);
    db.users.push({
      id: 'u_admin', username, salt, hash, isAdmin: true, createdAt: new Date().toISOString(),
      added: [], deletedIds: []
    });
    saveDB();
    console.log('[server] 已创建管理者账号  用户名: ' + username + '  密码: ' + pw);
  }
}
seedAdmin();

/* ---------- 工具 ---------- */
function findUserById(id) { return db.users.find((u) => u.id === id); }
function findUserByName(name) { return db.users.find((u) => u.username === name); }
function userIdByToken(token) { return db.sessions[token]; }
function isUserId(id) { return typeof id === 'string' && id.length > 0; }

function effectiveBank(user) {
  const deleted = new Set(user.deletedIds || []);
  const added = (user.added || []).map((q) => Object.assign({}, q));
  const base = BASE.questions.filter((q) => !deleted.has(q.id));
  return base.concat(added);
}
function publicUser(u) {
  return { id: u.id, username: u.username, isAdmin: !!u.isAdmin, createdAt: u.createdAt,
    addedCount: (u.added || []).length, deletedCount: (u.deletedIds || []).length };
}

/* ---------- HTTP 辅助 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json'
};
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 15e6) reject(new Error('payload too large')); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}
function authUser(req) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/);
  const token = m ? m[1] : (req.headers['x-auth-token'] || '');
  const uid = userIdByToken(token);
  if (!uid) return null;
  return findUserById(uid) || null;
}
function sanitizeQuestion(q) {
  q = q || {};
  const type = ['single', 'multiple', 'fill', 'judge', 'solve'].includes(q.type) ? q.type : 'fill';
  const stem = String(q.stem || '').trim();
  const chapter = String(q.chapter || '').trim() || '未分类';
  const difficulty = Math.min(5, Math.max(1, Number(q.difficulty) || 3));
  let answer = String(q.answer || '').trim();
  if (type === 'single') answer = answer.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
  else if (type === 'multiple') answer = answer.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
  const options = Array.isArray(q.options) ? q.options.map((o) => String(o)).filter((s) => s.trim()) : [];
  return {
    id: '',
    bankId: BASE.bankMeta.id,
    number: String(q.number || '').trim(),
    type, chapter, difficulty,
    stem, answer,
    options,
    analysis: String(q.analysis || '').trim()
  };
}

/* ---------- AI 题目识别（通义千问 Qwen-VL 代理）---------- */
const AI_CHAPTERS = [
  '高等数学·函数极限连续', '高等数学·一元函数微分学', '高等数学·一元函数积分学',
  '高等数学·多元函数微分学', '高等数学·多元函数积分学', '高等数学·无穷级数',
  '高等数学·常微分方程', '线性代数·行列式', '线性代数·矩阵', '线性代数·向量',
  '线性代数·线性方程组', '线性代数·特征值与特征向量', '线性代数·二次型',
  '概率论·随机事件和概率', '概率论·随机变量及其分布', '概率论·多维随机变量及其分布',
  '概率论·随机变量的数字特征', '概率论·大数定律与中心极限定理', '概率论·数理统计的基本概念',
  '概率论·参数估计', '概率论·假设检验'
];
const AI_TYPES = ['solve', 'choice', 'fill', 'judge', 'proof'];

// 从模型返回文本里尽量抠出 JSON
function extractJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

async function classifyOne(im, model, apiKey) {
  const prompt =
    '你是考研数学题库的切图质检员。下面是一张从 PDF 裁出的图片。' +
    '请判断它是否是一道“完整的数学题目”（而非：空白页 / 页眉页脚 / 页码 / 图注 / 广告水印 / 纯公式碎片 / 上一题的解答延续）。' +
    '只输出一个 JSON 对象，不要任何解释。格式：' +
    '{"isQuestion": true或false, "isBlank": true或false, "number": "题号字符串或null", "chapter": "章节或null", "type": "solve|choice|fill|judge|proof", "confidence": 0到1的小数}。' +
    'chapter 只能从以下选一（无法确定则写 null）：' + AI_CHAPTERS.join(' / ') + '。' +
    '若图片是题目但看不清题号，number 写 null；若明显是解答延续或碎片/空白，isQuestion 写 false。';
  const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: im.dataUrl } }
        ]
      }],
      response_format: { type: 'json_object' }
    })
  });
  const data = await resp.json().catch(() => ({}));
  let result = extractJson(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
  if (!result || typeof result !== 'object') result = { isQuestion: true, isBlank: false, confidence: 0 };
  result.id = im.id;
  result.isQuestion = result.isQuestion !== false;
  result.isBlank = !!result.isBlank;
  result.number = result.number && String(result.number).trim() ? String(result.number).trim() : null;
  result.chapter = (typeof result.chapter === 'string' && AI_CHAPTERS.indexOf(result.chapter) >= 0) ? result.chapter : null;
  result.type = AI_TYPES.indexOf(result.type) >= 0 ? result.type : 'solve';
  result.confidence = typeof result.confidence === 'number' ? Math.min(1, Math.max(0, result.confidence)) : 0.5;
  return result;
}

async function handleAiClassify(req, res) {
  const b = await readBody(req);
  const images = Array.isArray(b.images) ? b.images : [];
  if (!images.length) return sendJSON(res, 400, { error: 'no images' });
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return sendJSON(res, 500, { error: 'DASHSCOPE_API_KEY not set' });
  const model = process.env.DASHSCOPE_MODEL || 'qwen-vl-plus';
  const CONC = 5; // 并发上限
  const results = [];
  for (let i = 0; i < images.length; i += CONC) {
    const batch = images.slice(i, i + CONC);
    const settled = await Promise.all(batch.map((im) =>
      classifyOne(im, model, apiKey).catch((e) => ({ id: im.id, isQuestion: true, isBlank: false, confidence: 0, error: String(e && e.message || e) }))
    ));
    results.push(...settled);
  }
  return sendJSON(res, 200, { results });
}

/* ---------- API 路由 ---------- */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  // 健康检查
  if (p === '/api/health' && method === 'GET') {
    return sendJSON(res, 200, { ok: true, multiuser: true, baseCount: BASE.questions.length });
  }

  // AI 题目识别（通义千问 Qwen-VL 代理）。公开接口，无需登录。
  // 接收 { images: [{ id, dataUrl }] }，返回 { results: [{ id, isQuestion, isBlank, number, chapter, type, confidence }] }
  if (p === '/api/ai-classify' && method === 'POST') {
    return handleAiClassify(req, res);
  }

  // 注册
  if (p === '/api/register' && method === 'POST') {
    const b = await readBody(req);
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    if (username.length < 2) return sendJSON(res, 400, { error: '用户名至少 2 个字符' });
    if (password.length < 4) return sendJSON(res, 400, { error: '密码至少 4 位' });
    if (findUserByName(username)) return sendJSON(res, 409, { error: '用户名已存在' });
    const { salt, hash } = hashPW(password);
    const user = { id: newSeq('u'), username, salt, hash, isAdmin: false, createdAt: new Date().toISOString(), added: [], deletedIds: [] };
    db.users.push(user);
    saveDB();
    const token = newToken();
    db.sessions[token] = user.id;
    saveDB();
    return sendJSON(res, 200, { token, user: publicUser(user) });
  }

  // 登录
  if (p === '/api/login' && method === 'POST') {
    const b = await readBody(req);
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    const user = findUserByName(username);
    if (!user || !verifyPW(password, user.salt, user.hash)) return sendJSON(res, 401, { error: '用户名或密码错误' });
    const token = newToken();
    db.sessions[token] = user.id;
    saveDB();
    return sendJSON(res, 200, { token, user: publicUser(user) });
  }

  // 以下均需登录
  const me = authUser(req);
  if (!me) return sendJSON(res, 401, { error: '未登录或登录已过期' });

  // 当前用户
  if (p === '/api/me' && method === 'GET') {
    return sendJSON(res, 200, { user: publicUser(me) });
  }

  // 登出
  if (p === '/api/logout' && method === 'POST') {
    const auth = req.headers['authorization'] || '';
    const m = auth.match(/^Bearer\s+(.+)$/);
    const token = m ? m[1] : (req.headers['x-auth-token'] || '');
    if (token && db.sessions[token]) { delete db.sessions[token]; saveDB(); }
    return sendJSON(res, 200, { ok: true });
  }

  // 当前用户的有效题库
  if (p === '/api/bank' && method === 'GET') {
    return sendJSON(res, 200, {
      banks: [{ id: BASE.bankMeta.id, name: BASE.bankMeta.name }],
      bank: effectiveBank(me)
    });
  }

  // 新增题目
  if (p === '/api/questions' && method === 'POST') {
    const b = await readBody(req);
    const q = sanitizeQuestion(b);
    if (!q.stem) return sendJSON(res, 400, { error: '题干不能为空' });
    if ((q.type === 'single' || q.type === 'multiple') && q.options.length < 2) return sendJSON(res, 400, { error: '选择题至少需要 2 个选项' });
    if (!q.answer) return sendJSON(res, 400, { error: '答案不能为空' });
    q.id = newSeq('uq');
    me.added = me.added || [];
    me.added.push(q);
    saveDB();
    return sendJSON(res, 200, { question: q });
  }

  // 删除题目 / 更新题目
  const mQ = p.match(/^\/api\/questions\/(.+)$/);
  if (mQ && (method === 'DELETE' || method === 'PUT')) {
    const qid = decodeURIComponent(mQ[1]);
    if (method === 'DELETE') {
      const inAdded = (me.added || []).some((q) => q.id === qid);
      if (inAdded) {
        me.added = (me.added || []).filter((q) => q.id !== qid);
      } else {
        me.deletedIds = me.deletedIds || [];
        if (!me.deletedIds.includes(qid)) me.deletedIds.push(qid);
      }
      saveDB();
      return sendJSON(res, 200, { ok: true, removedFromAdded: inAdded });
    } else { // PUT：仅允许用户自己新增的题目
      const idx = (me.added || []).findIndex((q) => q.id === qid);
      if (idx < 0) return sendJSON(res, 403, { error: '基础题库题目不可编辑，可删除后重新添加' });
      const q = sanitizeQuestion(await readBody(req));
      if (!q.stem) return sendJSON(res, 400, { error: '题干不能为空' });
      if ((q.type === 'single' || q.type === 'multiple') && q.options.length < 2) return sendJSON(res, 400, { error: '选择题至少需要 2 个选项' });
      if (!q.answer) return sendJSON(res, 400, { error: '答案不能为空' });
      q.id = qid;
      me.added[idx] = q;
      saveDB();
      return sendJSON(res, 200, { question: q });
    }
  }

  // 管理者：用户列表
  if (p === '/api/admin/users' && method === 'GET') {
    if (!me.isAdmin) return sendJSON(res, 403, { error: '需要管理者权限' });
    return sendJSON(res, 200, { users: db.users.map(publicUser), baseCount: BASE.questions.length });
  }

  // 管理者：查看某用户的有效题库
  const mAdminBank = p.match(/^\/api\/admin\/users\/(.+)\/bank$/);
  if (mAdminBank && method === 'GET') {
    if (!me.isAdmin) return sendJSON(res, 403, { error: '需要管理者权限' });
    const uid = decodeURIComponent(mAdminBank[1]);
    const target = findUserById(uid);
    if (!target) return sendJSON(res, 404, { error: '用户不存在' });
    return sendJSON(res, 200, { user: publicUser(target), bank: effectiveBank(target) });
  }

  return sendJSON(res, 404, { error: 'not found' });
}

/* ---------- 静态文件 ---------- */
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA 回退到 index.html
      const idx = path.join(ROOT, 'index.html');
      if (fs.existsSync(idx)) {
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        return res.end(fs.readFileSync(idx));
      }
      res.writeHead(404); return res.end('not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------- 服务器 ---------- */
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => {
      console.error('[api error]', e);
      sendJSON(res, 500, { error: 'server error: ' + e.message });
    });
    return;
  }
  serveStatic(req, res, url);
});
server.listen(PORT, () => {
  console.log('[server] 研数工坊云端版已启动: http://localhost:' + PORT);
  console.log('[server] 管理者账号见上方日志；基础题库题目数: ' + BASE.questions.length);
});

module.exports = server;
