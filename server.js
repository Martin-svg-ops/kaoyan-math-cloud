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
const { execSync } = require('child_process');

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
  scheduleGitSync();
}
// Git 自动同步：每次数据变更后 5 秒内自动 commit+push 到 GitHub，确保部署间数据不丢失
let _gitSyncTimer = null;
function scheduleGitSync() {
  if (!process.env.GIT_TOKEN) return;
  if (_gitSyncTimer) clearTimeout(_gitSyncTimer);
  _gitSyncTimer = setTimeout(() => {
    _gitSyncTimer = null;
    try {
      const token = process.env.GIT_TOKEN;
      const repo = 'https://Martin-svg-ops:' + token + '@github.com/Martin-svg-ops/kaoyan-math-cloud.git';
      execSync('git add server-data/db.json', { cwd: ROOT, timeout: 8000 });
      try { execSync('git commit -m "data: auto-sync"', { cwd: ROOT, timeout: 8000 }); }
      catch (_) { /* 无变更，跳过 */ return; }
      // Render 环境是 detached HEAD，需显式 push 当前 HEAD 到远程 master 分支
      execSync('git push ' + repo + ' HEAD:master 2>&1', { cwd: ROOT, timeout: 15000 });
      console.log('[git-sync] 数据已同步到 GitHub');
    } catch (e) {
      console.error('[git-sync] 同步失败：', String(e.message || e).slice(0, 200));
    }
  }, 5000);
}
// 启动时从 Git 拉取并【合并】最新数据（本地优先，避免部署覆盖运行时新增的用户）
function mergeDBIntoLocal(remote) {
  if (!remote || !Array.isArray(remote.users)) return false;
  let local = { users: [], sessions: {}, seq: {} };
  if (fs.existsSync(DB_FILE)) {
    try { local = Object.assign(local, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); }
    catch (_) { /* 损坏则基于远程重建 */ }
  }
  const ids = new Set(local.users.map((u) => u.id));
  (remote.users || []).forEach((ru) => {
    if (!ids.has(ru.id)) { local.users.push(ru); ids.add(ru.id); } // 远程独有的用户并入本地；本地已有的保留（本地优先，不覆盖）
  });
  // sessions / seq 取本地与远程的并集（远程优先补齐，避免丢掉其他实例的会话）
  local.sessions = Object.assign({}, remote.sessions || {}, local.sessions);
  local.seq = Object.assign({}, remote.seq || {}, local.seq);
  fs.writeFileSync(DB_FILE, JSON.stringify(local, null, 2));
  return true;
}
function initGit() {
  try {
    execSync('git config user.email "sync@kaoyan-math.local"', { cwd: ROOT });
    execSync('git config user.name "KaoyanMathSync"', { cwd: ROOT });
    if (process.env.GIT_TOKEN) {
      const token = process.env.GIT_TOKEN;
      const repo = 'https://Martin-svg-ops:' + token + '@github.com/Martin-svg-ops/kaoyan-math-cloud.git';
      try {
        execSync('git fetch ' + repo + ' master 2>&1', { cwd: ROOT, timeout: 15000 });
        // 只把远程 db.json 读出来【合并】进本地，绝不直接 checkout 覆盖本地运行数据
        const tmp = path.join(ROOT, 'server-data', '.remote-db-merge.json');
        execSync('git show FETCH_HEAD:server-data/db.json > "' + tmp + '" 2>/dev/null', { cwd: ROOT, timeout: 8000 });
        if (fs.existsSync(tmp)) {
          try {
            const remote = JSON.parse(fs.readFileSync(tmp, 'utf8'));
            if (mergeDBIntoLocal(remote)) console.log('[git] 已合并远程 db.json（本地优先，不覆盖已有用户）');
          } catch (_) { /* 远程数据损坏，忽略 */ }
          try { fs.unlinkSync(tmp); } catch (_) {}
        }
      } catch (_) { /* 远程无数据，使用本地 */ }
    }
  } catch (_) { /* git 不可用 */ }
}
initGit();
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

/* ---------- 短信验证码（腾讯云 SMS，开发模式回传便于测试） ---------- */
const SMS_TTL = 5 * 60 * 1000;       // 验证码有效期 5 分钟
const SMS_COOLDOWN = 60 * 1000;      // 同一手机号 60 秒内只能发一次
const smsStore = new Map();          // phone -> { code, expires, purpose, username?, cooldownUntil }
function maskPhone(p) {
  p = String(p || '');
  if (p.length === 11) return p.slice(0, 3) + '****' + p.slice(7);
  if (!p) return '';
  return p.slice(0, 3) + '****' + p.slice(-2);
}
function genSmsCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function smsDevMode() { return !process.env.TENCENT_SMS_SECRET_ID; }
function hmac(key, data, enc) { return crypto.createHmac('sha256', key).update(data).digest(enc || 'binary'); }
function httpsPostJson(host, headers, body) {
  return new Promise((resolve) => {
    const https = require('https');
    const req = https.request({ host, method: 'POST', path: '/', headers, timeout: 10000 }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}
// 腾讯云 SMS SendSms（TC3-HMAC-SHA256 签名，纯 Node 实现，无第三方依赖）
async function tencentSendSms(phone, code) {
  const secretId = process.env.TENCENT_SMS_SECRET_ID;
  const secretKey = process.env.TENCENT_SMS_SECRET_KEY;
  const sdkAppId = process.env.TENCENT_SMS_SDK_APP_ID;
  const signName = process.env.TENCENT_SMS_SIGN_NAME;
  const templateId = process.env.TENCENT_SMS_TEMPLATE_ID;
  if (!secretId || !secretKey || !sdkAppId || !signName || !templateId) {
    return '腾讯云短信未完整配置（缺少 TENCENT_SMS_* 环境变量）';
  }
  const region = process.env.TENCENT_SMS_REGION || 'ap-guangzhou';
  const service = 'sms';
  const host = 'sms.tencentcloudapi.com';
  const action = 'SendSms';
  const version = '2021-01-11';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    PhoneNumberSet: ['+86' + phone],
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [code]
  });
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + host + '\n';
  const signedHeaders = 'content-type;host';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n');
  const credentialScope = date + '/' + service + '/tc3_request';
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const secretDate = hmac('TC3' + secretKey, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = hmac(secretSigning, stringToSign, 'hex');
  const authorization = 'TC3-HMAC-SHA256 Credential=' + secretId + '/' + credentialScope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  const headers = {
    'Authorization': authorization,
    'Content-Type': 'application/json; charset=utf-8',
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Region': region
  };
  const resp = await httpsPostJson(host, headers, payload);
  if (!resp || !resp.Response) return '腾讯云短信返回异常';
  if (resp.Response.Error) return '腾讯云短信错误: ' + resp.Response.Error.Code + ' ' + resp.Response.Error.Message;
  const set = (resp.Response.SendStatusSet || []);
  if (!set.length) return '腾讯云短信返回异常';
  const st = set[0];
  if (st.Code !== 'Ok') return '腾讯云短信发送失败: ' + st.Code + ' ' + (st.Message || '');
  return null; // 成功
}
async function sendSms(phone, code, purpose) {
  if (smsDevMode()) {
    console.log('[sms][DEV] 向 ' + phone + ' 发送验证码(' + purpose + '): ' + code);
    return { dev: true, code: code };
  }
  const err = await tencentSendSms(phone, code);
  if (err) throw new Error(err);
  return { dev: false };
}

/* ---------- 种子管理者账号 ---------- */
function seedAdmin() {
  if (!db.users.some((u) => u.isAdmin)) {
    const username = process.env.ADMIN_USER || 'admin';
    const pw = process.env.ADMIN_PASSWORD || 'admin123';
    const { salt, hash } = hashPW(pw);
    db.users.push({
      id: 'u_admin', username, salt, hash, isAdmin: true, hasBaseBank: true, createdAt: new Date().toISOString(),
      added: [], deletedIds: [], wrongBooks: [], phone: ''
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
  const deletedBanks = new Set(user.deletedBankIds || []);
  // 只有拥有基础题库权限的用户（管理员或被显式授予）才包含 880 基础题库
  const hasBase = user.isAdmin || user.hasBaseBank === true;
  const base = (hasBase && !deletedBanks.has(BASE.bankMeta.id)) ? BASE.questions.filter((q) => !deleted.has(q.id)) : [];
  // 过滤掉属于已删除题库的用户新增题目
  const added = (user.added || []).filter((q) => !deletedBanks.has(q.bankId)).map((q) => Object.assign({}, q));
  return base.concat(added);
}
function publicUser(u) {
  const phone = u.phone || '';
  return { id: u.id, username: u.username, isAdmin: !!u.isAdmin, createdAt: u.createdAt,
    addedCount: (u.added || []).length, deletedCount: (u.deletedIds || []).length,
    phone: phone ? maskPhone(phone) : '', phoneBound: !!phone };
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

// 本地文本三级分类：
// 返回 true  = 确定是题目（无需 AI）
// 返回 false = 确定不是题目（无需 AI）
// 返回 null  = 拿不准，需要 AI 视觉判断
function localTextClassify(text) {
  if (!text) return null; // 无文本（图片型 PDF），交给 AI
  const t = String(text).trim();
  if (!t) return false; // 空文本
  const cjk = (t.match(/[一-龥]/g) || []).length;
  // ── 确定噪声 ──
  if (/^[0-9\s]+$/.test(t)) return false;
  if (/^第\s*\d+\s*页/.test(t)) return false;
  if (t.length < 8 && cjk < 2) return false;
  if (/^(图|表)\s*\d/.test(t) && t.length < 22) return false;
  if (/^(解|答)[：:。．.\s]/.test(t) || /^(解|答)$/.test(t)) return false;
  if (/^(由|故|因|所以|则|当|代入|可得|综上|因此|显然|易知|即|其|该|此|而|且|于是|从而|又|因为|证毕|证[。．.])/.test(t)) return false;
  // ── 确定是题目 ──
  if (cjk >= 8 && t.length >= 20) return true;
  if (/^(求|设|证明|证 |已知|若 |计算|讨论|确定|判断|试 |试求|试证|求极限|求导|求积分|证明:|证明：|设函数|设数列)/.test(t) && cjk >= 4) return true;
  if (/[?？]/.test(t) && cjk >= 4) return true;
  if (/^(填空题|选择题|判断题|证明题|计算题|解答题)/.test(t)) return true;
  // ── 拿不准 ──
  return null;
}

// 把多张图片合并到一次 API 调用中统一判断（提速核心：1 次网络往返替代 N 次）
async function classifyBatch(images, model, apiKey) {
  // 构造 content 数组：交替插入标签和图片
  const content = [];
  for (let i = 0; i < images.length; i++) {
    content.push({ type: 'text', text: `[${i + 1}]` });
    content.push({ type: 'image_url', image_url: { url: images[i].dataUrl } });
  }
  content.push({
    type: 'text',
    text: `以上${images.length}张图片（编号[1]到[${images.length}]），逐张判断是不是完整数学题目。
只输出JSON: {"items":[{"i":1,"q":true,"b":false},...]}
q=true表示是题目，q=false不是题目；b=true是空白/碎片；i对应编号。`
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let resp;
  try {
    resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_object' }
      }),
      signal: ctrl.signal
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await resp.json().catch(() => ({}));
  const raw = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) {}
  if (!parsed || !Array.isArray(parsed.items)) {
    parsed = extractJson(raw);
    if (!parsed || !Array.isArray(parsed && parsed.items)) {
      // 解析失败：全部保留（降级）
      return images.map((im, i) => ({ id: im.id, isQuestion: true, isBlank: false, confidence: 0, parseError: true }));
    }
  }
  const items = parsed.items || [];
  return images.map((im, i) => {
    const item = (items[i] !== undefined) ? items[i] : {};
    return {
      id: im.id,
      isQuestion: item.q !== false,
      isBlank: !!item.b,
      number: null,
      confidence: 0.5,
      aiBatch: true
    };
  });
}

async function handleAiClassify(req, res) {
  const b = await readBody(req);
  const allImages = Array.isArray(b.images) ? b.images : [];
  if (!allImages.length) return sendJSON(res, 400, { error: 'no images' });
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return sendJSON(res, 500, { error: 'DASHSCOPE_API_KEY not set' });
  const model = process.env.DASHSCOPE_MODEL || 'qwen-vl-plus';

  // 1) 本地文本分类：确定的直接处理，拿不准的才发 AI
  const localResults = [];
  const needAi = [];
  for (const im of allImages) {
    const local = localTextClassify(im.text);
    if (local === false) {
      localResults.push({ id: im.id, isQuestion: false, isBlank: true, confidence: 1, local: 'noise' });
    } else if (local === true) {
      localResults.push({ id: im.id, isQuestion: true, isBlank: false, confidence: 1, local: 'question' });
    } else {
      needAi.push(im);
    }
  }

  // 2) 需要 AI 的图片：每批最多 6 张合并一次调用
  const BATCH = 6;
  const aiResults = [];
  for (let i = 0; i < needAi.length; i += BATCH) {
    const batch = needAi.slice(i, i + BATCH);
    try {
      const r = await classifyBatch(batch, model, apiKey);
      aiResults.push(...r);
    } catch (e) {
      // 单个批次失败：此批全部降级保留
      aiResults.push(...batch.map((im) => ({ id: im.id, isQuestion: true, isBlank: false, confidence: 0, error: String(e && e.message || e) })));
    }
  }

  return sendJSON(res, 200, { results: [...localResults, ...aiResults] });
}

/* ---------- API 路由 ---------- */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  // 健康检查
  if (p === '/api/health' && method === 'GET') {
    return sendJSON(res, 200, { ok: true, multiuser: true, baseCount: BASE.questions.length, version: 'v64' });
  }

  // AI 题目识别（通义千问 Qwen-VL 代理）。公开接口，无需登录。
  // 接收 { images: [{ id, dataUrl }] }，返回 { results: [{ id, isQuestion, isBlank, number, chapter, type, confidence }] }
  if (p === '/api/ai-classify' && method === 'POST') {
    return handleAiClassify(req, res);
  }

  // 找回密码：发送验证码（公开，需用户名与该账号绑定手机号一致）
  if (p === '/api/auth/send-reset-code' && method === 'POST') {
    const b = await readBody(req);
    const username = String(b.username || '').trim();
    const phone = String(b.phone || '').trim();
    if (username.length < 2) return sendJSON(res, 400, { error: '请输入用户名' });
    if (!/^1[3-9]\d{9}$/.test(phone)) return sendJSON(res, 400, { error: '手机号格式不正确' });
    const user = findUserByName(username);
    if (!user || user.phone !== phone) return sendJSON(res, 400, { error: '该账号未绑定此手机号，或账号不存在' });
    const rec = smsStore.get(phone);
    if (rec && rec.cooldownUntil && Date.now() < rec.cooldownUntil) {
      return sendJSON(res, 429, { error: '验证码发送过于频繁，请 ' + Math.ceil((rec.cooldownUntil - Date.now()) / 1000) + ' 秒后再试' });
    }
    const code = genSmsCode();
    smsStore.set(phone, { code, expires: Date.now() + SMS_TTL, purpose: 'reset', username, cooldownUntil: Date.now() + SMS_COOLDOWN });
    try {
      const r = await sendSms(phone, code, 'reset');
      return sendJSON(res, 200, { ok: true, dev: !!r.dev, code: r.dev ? r.code : undefined });
    } catch (e) {
      return sendJSON(res, 500, { error: '短信发送失败：' + (e.message || e) });
    }
  }

  // 找回密码：校验验证码并重置
  if (p === '/api/auth/reset-password' && method === 'POST') {
    const b = await readBody(req);
    const username = String(b.username || '').trim();
    const phone = String(b.phone || '').trim();
    const code = String(b.code || '').trim();
    const newPassword = String(b.newPassword || '');
    if (newPassword.length < 4) return sendJSON(res, 400, { error: '新密码至少 4 位' });
    const rec = smsStore.get(phone);
    if (!rec || rec.purpose !== 'reset' || rec.username !== username) return sendJSON(res, 400, { error: '请先获取验证码' });
    if (Date.now() > rec.expires) { smsStore.delete(phone); return sendJSON(res, 400, { error: '验证码已过期，请重新获取' }); }
    if (rec.code !== code) return sendJSON(res, 400, { error: '验证码错误' });
    const user = findUserByName(username);
    if (!user || user.phone !== phone) return sendJSON(res, 400, { error: '账号或手机号不匹配' });
    const hp = hashPW(newPassword);
    user.salt = hp.salt; user.hash = hp.hash;
    smsStore.delete(phone);
    saveDB();
    return sendJSON(res, 200, { ok: true });
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
    const user = { id: newSeq('u'), username, salt, hash, isAdmin: false, hasBaseBank: false, createdAt: new Date().toISOString(), added: [], deletedIds: [], wrongBooks: [], phone: '' };
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
    me.wrongBooks = me.wrongBooks || [];
    return sendJSON(res, 200, { user: publicUser(me), wrongBooks: me.wrongBooks });
  }

  // 绑定手机号：发送验证码（需登录）
  if (p === '/api/send-bind-code' && method === 'POST') {
    const b = await readBody(req);
    const phone = String(b.phone || '').trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) return sendJSON(res, 400, { error: '手机号格式不正确' });
    if (db.users.some((u) => u.phone === phone && u.id !== me.id)) return sendJSON(res, 400, { error: '该手机号已被其他账号绑定' });
    const rec = smsStore.get(phone);
    if (rec && rec.cooldownUntil && Date.now() < rec.cooldownUntil) {
      return sendJSON(res, 429, { error: '验证码发送过于频繁，请 ' + Math.ceil((rec.cooldownUntil - Date.now()) / 1000) + ' 秒后再试' });
    }
    const code = genSmsCode();
    smsStore.set(phone, { code, expires: Date.now() + SMS_TTL, purpose: 'bind', cooldownUntil: Date.now() + SMS_COOLDOWN });
    try {
      const r = await sendSms(phone, code, 'bind');
      return sendJSON(res, 200, { ok: true, dev: !!r.dev, code: r.dev ? r.code : undefined });
    } catch (e) {
      return sendJSON(res, 500, { error: '短信发送失败：' + (e.message || e) });
    }
  }

  // 绑定手机号：校验验证码并绑定（需登录）
  if (p === '/api/bind-phone' && method === 'POST') {
    const b = await readBody(req);
    const phone = String(b.phone || '').trim();
    const code = String(b.code || '').trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) return sendJSON(res, 400, { error: '手机号格式不正确' });
    if (db.users.some((u) => u.phone === phone && u.id !== me.id)) return sendJSON(res, 400, { error: '该手机号已被其他账号绑定' });
    const rec = smsStore.get(phone);
    if (!rec || rec.purpose !== 'bind') return sendJSON(res, 400, { error: '请先获取验证码' });
    if (Date.now() > rec.expires) { smsStore.delete(phone); return sendJSON(res, 400, { error: '验证码已过期，请重新获取' }); }
    if (rec.code !== code) return sendJSON(res, 400, { error: '验证码错误' });
    me.phone = phone;
    smsStore.delete(phone);
    saveDB();
    return sendJSON(res, 200, { ok: true, user: publicUser(me) });
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
    me.deletedBankIds = me.deletedBankIds || [];
    const deletedSet = new Set(me.deletedBankIds);
    // 从用户新增题目中提取非删除的自定义题库
    const customBanks = [];
    const seen = new Set();
    (me.added || []).forEach(q => {
      if (q.bankId && q.bankId !== BASE.bankMeta.id && !deletedSet.has(q.bankId) && !seen.has(q.bankId)) {
        seen.add(q.bankId);
        customBanks.push({ id: q.bankId, name: q.bankName || q.bankId });
      }
    });
    const hasBase = me.isAdmin || me.hasBaseBank === true;
    const banks = (hasBase && !deletedSet.has(BASE.bankMeta.id)) ? [{ id: BASE.bankMeta.id, name: BASE.bankMeta.name }, ...customBanks] : [...customBanks];
    return sendJSON(res, 200, {
      banks: banks,
      bank: effectiveBank(me),
      deletedBankIds: me.deletedBankIds || []
    });
  }

  // 删除整个题库（标记该题库为已删除，移除其中所有题目）
  const mBankDel = p.match(/^\/api\/bank\/(.+)$/);
  if (mBankDel && method === 'DELETE') {
    const bankId = decodeURIComponent(mBankDel[1]);
    me.deletedBankIds = me.deletedBankIds || [];
    if (!me.deletedBankIds.includes(bankId)) me.deletedBankIds.push(bankId);
    // 移除该题库中用户新增的题目
    if (bankId !== BASE.bankMeta.id) {
      me.added = (me.added || []).filter(q => q.bankId !== bankId);
    } else {
      // 删除基础题库：标记所有基础题 ID 为已删除
      BASE.questions.forEach(q => {
        if (!(me.deletedIds || []).includes(q.id)) {
          me.deletedIds = me.deletedIds || [];
          me.deletedIds.push(q.id);
        }
      });
      me.added = (me.added || []).filter(q => q.bankId !== BASE.bankMeta.id);
    }
    saveDB();
    return sendJSON(res, 200, { ok: true });
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

  // ── 错题本 API ──

  // 获取所有错题本
  if (p === '/api/wrong-books' && method === 'GET') {
    me.wrongBooks = me.wrongBooks || [];
    return sendJSON(res, 200, { wrongBooks: me.wrongBooks });
  }

  // 新建错题本
  if (p === '/api/wrong-books' && method === 'POST') {
    const b = await readBody(req);
    const name = String(b.name || '').trim();
    if (!name) return sendJSON(res, 400, { error: '错题本名称不能为空' });
    me.wrongBooks = me.wrongBooks || [];
    const wb = { id: newSeq('wb'), name, createdAt: new Date().toISOString(), entries: [] };
    me.wrongBooks.push(wb);
    saveDB();
    return sendJSON(res, 200, { wrongBook: wb });
  }

  // 更新 / 删除错题本
  const mWB = p.match(/^\/api\/wrong-books\/(.+)$/);
  if (mWB) {
    const wbId = decodeURIComponent(mWB[1]);
    me.wrongBooks = me.wrongBooks || [];
    const idx = me.wrongBooks.findIndex((wb) => wb.id === wbId);
    if (idx < 0) return sendJSON(res, 404, { error: '错题本不存在' });

    if (method === 'DELETE') {
      me.wrongBooks.splice(idx, 1);
      saveDB();
      return sendJSON(res, 200, { ok: true });
    }

    if (method === 'PUT') {
      const b = await readBody(req);
      const wb = me.wrongBooks[idx];
      if (b.name !== undefined) {
        const name = String(b.name || '').trim();
        if (!name) return sendJSON(res, 400, { error: '错题本名称不能为空' });
        wb.name = name;
      }
      if (b.addEntries !== undefined) {
        const add = Array.isArray(b.addEntries) ? b.addEntries : [];
        wb.entries = wb.entries || [];
        for (const e of add) {
          const existIdx = wb.entries.findIndex((x) => x.qid === e.qid);
          if (existIdx >= 0) {
            wb.entries[existIdx].wrongCount = (wb.entries[existIdx].wrongCount || 0) + 1;
            wb.entries[existIdx].lastAt = e.lastAt || new Date().toISOString();
            wb.entries[existIdx].mastered = false;
          } else {
            wb.entries.push({
              qid: e.qid,
              wrongCount: e.wrongCount || 1,
              lastAt: e.lastAt || new Date().toISOString(),
              mastered: !!e.mastered
            });
          }
        }
      }
      if (b.removeQids !== undefined) {
        const remove = Array.isArray(b.removeQids) ? new Set(b.removeQids) : new Set();
        wb.entries = (wb.entries || []).filter((x) => !remove.has(x.qid));
      }
      if (b.markMastered !== undefined) {
        const qid = String(b.markMastered);
        const entry = (wb.entries || []).find((x) => x.qid === qid);
        if (entry) entry.mastered = true;
      }
      if (b.unmaster !== undefined) {
        const qid = String(b.unmaster);
        const entry = (wb.entries || []).find((x) => x.qid === qid);
        if (entry) entry.mastered = false;
      }
      saveDB();
      return sendJSON(res, 200, { wrongBook: wb });
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

  // 管理者：删除指定用户
  const mAdminDel = p.match(/^\/api\/admin\/users\/(.+)$/);
  if (mAdminDel && method === 'DELETE') {
    if (!me.isAdmin) return sendJSON(res, 403, { error: '需要管理者权限' });
    const uid = decodeURIComponent(mAdminDel[1]);
    if (uid === me.id) return sendJSON(res, 400, { error: '不能删除自己' });
    const targetIdx = db.users.findIndex((u) => u.id === uid);
    if (targetIdx < 0) return sendJSON(res, 404, { error: '用户不存在' });
    const targetName = db.users[targetIdx].username;
    // 清理该用户的所有会话
    Object.keys(db.sessions).forEach((k) => { if (db.sessions[k] === uid) delete db.sessions[k]; });
    db.users.splice(targetIdx, 1);
    saveDB();
    console.log('[server] 管理者 ' + me.username + ' 已删除用户: ' + targetName);
    return sendJSON(res, 200, { ok: true, deleted: targetName });
  }

  // 管理者：导出数据库备份（用于部署前保留用户数据）
  if (p === '/api/admin/db-backup' && method === 'GET') {
    if (!me.isAdmin) return sendJSON(res, 403, { error: '需要管理者权限' });
    return sendJSON(res, 200, { db: db, baseCount: BASE.questions.length });
  }

  // 管理者：恢复数据库（覆盖当前 db，用于持久磁盘首次挂载后恢复数据）
  if (p === '/api/admin/db-restore' && method === 'POST') {
    if (!me.isAdmin) return sendJSON(res, 403, { error: '需要管理者权限' });
    const b = await readBody(req);
    if (!b || !b.db || !Array.isArray(b.db.users)) return sendJSON(res, 400, { error: '无效的备份数据' });
    // 保留当前 admin 用户，合并其他用户数据
    const keepAdmin = db.users.find((u) => u.isAdmin);
    db = Object.assign({ users: [], sessions: {}, seq: {} }, b.db);
    // 确保当前 admin 存在（磁盘挂载后自动生成的 admin 可能与备份不同）
    if (keepAdmin) {
      const bakAdminIdx = db.users.findIndex((u) => u.id === 'u_admin');
      if (bakAdminIdx >= 0) {
        // 保留当前 admin 的密码哈希（磁盘生成的），但恢复其题库权限
        db.users[bakAdminIdx] = Object.assign({}, db.users[bakAdminIdx], {
          salt: keepAdmin.salt, hash: keepAdmin.hash, hasBaseBank: true
        });
      }
    }
    saveDB();
    console.log('[server] 数据库已从备份恢复，用户数: ' + db.users.length);
    return sendJSON(res, 200, { ok: true, userCount: db.users.length });
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
  // ===== CORS：允许原生 App（Capacitor WebView，来源为 capacitor://localhost 或 null）跨域调用云后端 =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

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
