#!/usr/bin/env node
/**
 * 存量图片迁移脚本：把 db.json 中所有 base64 图片上传到 S3 兼容对象存储（R2/COS），
 * 替换为 URL（imgUrl），大幅缩小 db.json 与 /api/bank 响应。
 *
 * 用法（先配好环境变量，密钥不落盘）：
 *   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com \
 *   S3_REGION=auto \
 *   S3_ACCESS_KEY=xxx S3_SECRET_KEY=xxx S3_BUCKET=kaoyan-images \
 *   S3_PUBLIC_BASE=https://<pub>.r2.dev/ \
 *   node scripts/migrate_s3.js
 *
 * 可选：GIT_TOKEN 用于直接读写 GitHub 上的 db.json（否则读取本地 server-data/db.json，
 * 迁移完成后需手动提交推送）。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'server-data', 'db.json');

const ep = process.env.S3_ENDPOINT || '';
const ak = process.env.S3_ACCESS_KEY || '';
const sk = process.env.S3_SECRET_KEY || '';
const bucket = process.env.S3_BUCKET || '';
const region = process.env.S3_REGION || 'auto';
const pubBase = (process.env.S3_PUBLIC_BASE || '').replace(/\/+$/, '') + '/';
if (!(ep && ak && sk && bucket)) {
  console.error('缺少环境变量：S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET');
  process.exit(1);
}
const s3 = new S3Client({ region, endpoint: ep, forcePathStyle: true, credentials: { accessKeyId: ak, secretAccessKey: sk } });
const prefix = process.env.S3_PREFIX || 'images/';

function gh(method, path2, body) {
  const token = process.env.GIT_TOKEN || '';
  return new Promise((res, rej) => {
    const r = https.request('https://api.github.com' + path2, { method, headers: { Authorization: 'token ' + token, 'User-Agent': 'migrate', 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' } }, x => {
      let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res({ s: x.statusCode, b: JSON.parse(d) }); } catch (e) { res({ s: x.statusCode, b: d }); } });
    });
    r.on('error', rej); if (body) r.write(JSON.stringify(body)); r.end();
  });
}

async function uploadOne(dataUrl) {
  const m = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const key = prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(m[2], 'base64'), ContentType: 'image/' + ext }));
  return pubBase + key;
}

(async () => {
  let db;
  let githubSha = null;
  if (process.env.GIT_TOKEN && process.env.GITHUB_REPO) {
    // 从 GitHub 读取最新 db.json
    const meta = await gh('GET', '/repos/' + process.env.GITHUB_REPO + '/contents/server-data/db.json');
    if (meta.s !== 200) { console.error('GitHub 读取失败', meta.s); process.exit(1); }
    githubSha = meta.b.sha;
    db = JSON.parse(Buffer.from(meta.b.content, 'base64').toString('utf8'));
    console.log('从 GitHub 读取 db.json（sha ' + githubSha.slice(0, 7) + '）');
  } else {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    console.log('从本地读取 db.json');
  }
  let migrated = 0, failed = 0, skipped = 0;
  for (const u of db.users || []) {
    for (const q of u.added || []) {
      if (q.imgUrl) { skipped++; continue; } // 已迁移
      if (!q.img) { skipped++; continue; }   // 非图片题
      try {
        const url = await uploadOne(q.img);
        if (url) { q.imgUrl = url; delete q.img; migrated++; }
        else failed++;
      } catch (e) { failed++; console.error('上传失败', q.id, e.message); }
      if ((migrated + failed) % 50 === 0) console.log('进度:', migrated + failed + '/' + (migrated + failed + skipped), '成功', migrated, '失败', failed);
    }
  }
  console.log('=== 迁移完成: 成功', migrated, '| 失败', failed, '| 已迁移/非图片跳过', skipped);
  if (githubSha && process.env.GITHUB_REPO) {
    const put = await gh('PUT', '/repos/' + process.env.GITHUB_REPO + '/contents/server-data/db.json', {
      message: 'data: migrate images to S3 (imgUrl)',
      content: Buffer.from(JSON.stringify(db, null, 2)).toString('base64'),
      sha: githubSha
    });
    console.log('GitHub 回写:', put.s === 200 ? 'OK（需触发 Render 部署生效）' : 'FAIL ' + JSON.stringify(put.b).slice(0, 200));
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    console.log('已写回本地 server-data/db.json（请手动 git add/commit/push + 部署）');
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
