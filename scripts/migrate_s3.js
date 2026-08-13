#!/usr/bin/env node
/**
 * 存量图片迁移脚本（本地模式）：读取本地 server-data/db.json，把 base64 图片上传到
 * S3 兼容对象存储（Supabase/R2/COS），替换为 imgUrl 后写回本地文件。
 * 用途：git fetch + git show origin/master:server-data/db.json > server-data/db.json 检出最新，
 *       运行本脚本，再 git add/commit/push（db.json 从 30MB 瘦身到几百 KB）。
 * 环境变量：S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET / S3_PUBLIC_BASE / S3_PREFIX(可选)
 */
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const DB_FILE = path.join(__dirname, '..', 'server-data', 'db.json');
const ep = process.env.S3_ENDPOINT || '';
const ak = process.env.S3_ACCESS_KEY || '';
const sk = process.env.S3_SECRET_KEY || '';
const bucket = process.env.S3_BUCKET || '';
const pubBase = (process.env.S3_PUBLIC_BASE || '').replace(/\/+$/, '') + '/';
if (!(ep && ak && sk && bucket && pubBase)) {
  console.error('缺少环境变量：S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET / S3_PUBLIC_BASE');
  process.exit(1);
}
const s3 = new S3Client({ region: process.env.S3_REGION || 'auto', endpoint: ep, forcePathStyle: true, credentials: { accessKeyId: ak, secretAccessKey: sk } });
const prefix = process.env.S3_PREFIX || 'images/';

async function uploadOne(dataUrl) {
  const m = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const key = prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(m[2], 'base64'), ContentType: 'image/' + ext }));
  return pubBase + key;
}

(async () => {
  if (!fs.existsSync(DB_FILE)) { console.error('本地 db.json 不存在：' + DB_FILE); process.exit(1); }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log('读取本地 db.json：' + (Buffer.byteLength(JSON.stringify(db)) / 1048576).toFixed(1) + ' MB');
  let migrated = 0, failed = 0, skipped = 0, failIds = [];
  for (const u of db.users || []) {
    for (const q of u.added || []) {
      if (q.imgUrl) { skipped++; continue; }
      if (!q.img) { skipped++; continue; }
      try {
        const url = await uploadOne(q.img);
        if (url) { q.imgUrl = url; delete q.img; migrated++; }
        else { failed++; failIds.push(q.id); }
      } catch (e) { failed++; failIds.push(q.id); console.error('上传失败', q.id, e.message); }
      if ((migrated + failed) % 50 === 0) console.log('进度: 成功 ' + migrated + ' | 失败 ' + failed + ' | 跳过 ' + skipped);
    }
  }
  console.log('=== 迁移完成: 成功 ' + migrated + ' | 失败 ' + failed + ' | 跳过 ' + skipped);
  if (failed > 0) console.log('失败题ID:', failIds.slice(0, 20).join(','));
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  console.log('已写回 ' + DB_FILE + '（' + (Buffer.byteLength(JSON.stringify(db)) / 1048576).toFixed(2) + ' MB，请 git add/commit/push + 部署）');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
