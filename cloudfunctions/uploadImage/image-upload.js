'use strict';
const crypto = require('crypto');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CHUNK_BYTES = 192 * 1024;
const UPLOAD_TTL = 30 * 60 * 1000;
const SIZE_MESSAGE = '单张图片必须小于5MB（不含5MB），请压缩后重新选择。';

function checkSize(size) {
  if (!Number.isInteger(size) || size < 12) throw Error('图片无效，请重新选择JPEG/PNG图片');
  if (size >= MAX_IMAGE_BYTES) throw Error(SIZE_MESSAGE);
}

function decode(data, limit) {
  if (typeof data !== 'string' || !data.length || data.length > 4 * Math.ceil(limit / 3)) {
    throw Error('图片数据无效或过大');
  }
  // 严格检查编码，避免 Buffer.from 忽略非法字符或截断后放行。
  if (data.length % 4 || /[^A-Za-z0-9+/=]/.test(data)) throw Error('图片编码无效');
  const buffer = Buffer.from(data, 'base64');
  if (buffer.length > limit || buffer.toString('base64') !== data) throw Error('图片数据无效或过大');
  return buffer;
}

function validateBuffer(buffer) {
  checkSize(buffer.length);
  let ext;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ext = 'png';
  else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) ext = 'jpg';
  else throw Error('只支持JPEG/PNG图片');
  return {buffer, ext};
}

function image(data) {
  return validateBuffer(decode(data, MAX_IMAGE_BYTES));
}

async function storeImage(repo, storage, parsed) {
  const fileId = await storage.upload('family/' + crypto.randomBytes(20).toString('hex') + '.' + parsed.ext, parsed.buffer);
  try { await repo.addImage(fileId); }
  catch (error) { await storage.remove(fileId).catch(() => {}); throw error; }
  return {fileId};
}

// 暂存文档复用 images 集合；不含 fileId，不能被 saveDish 当成已登记图片。
async function session(repo, openid, uploadId, allowExpired = false) {
  if (typeof uploadId !== 'string' || !/^upload_[a-f0-9]{40}$/.test(uploadId)) throw Error('图片上传标识无效');
  const current = await repo.getImageUpload(uploadId);
  if (!current || current.kind !== 'imageUpload' || current.owner !== openid) throw Error('图片上传记录无效，请重新选择');
  if (!allowExpired && current.expiresAt <= Date.now()) throw Error('图片上传已超时，请重新选择');
  checkSize(current.size);
  return current;
}

async function runUpload(repo, storage, openid, event) {
  if (event.action === 'beginImageUpload') {
    checkSize(event.size);
    const uploadId = 'upload_' + crypto.randomBytes(20).toString('hex');
    await repo.beginImageUpload(uploadId, {kind: 'imageUpload', owner: openid, size: event.size,
      createdAt: Date.now(), expiresAt: Date.now() + UPLOAD_TTL});
    return {uploadId};
  }
  const current = await session(repo, openid, event.uploadId, event.action === 'abortImageUpload');
  const count = Math.ceil(current.size / CHUNK_BYTES);
  if (event.action === 'abortImageUpload') {
    await repo.clearImageUpload(event.uploadId, count);
    return {ok: true};
  }
  if (event.action === 'uploadImageChunk') {
    if (!Number.isInteger(event.index) || event.index < 0 || event.index >= count) throw Error('图片分段无效');
    const chunk = decode(event.base64, CHUNK_BYTES);
    const expected = Math.min(CHUNK_BYTES, current.size - event.index * CHUNK_BYTES);
    if (chunk.length !== expected) throw Error('图片分段大小不正确，请重新选择');
    await repo.putImageChunk(event.uploadId, event.index, {kind: 'imageUploadChunk',
      base64: event.base64, expiresAt: current.expiresAt});
    return {ok: true};
  }
  if (event.action === 'finishImageUpload') {
    const rows = await Promise.all(Array.from({length: count}, (_, index) => repo.getImageChunk(event.uploadId, index)));
    const chunks = rows.map((row, index) => {
      if (!row || row.kind !== 'imageUploadChunk') throw Error('图片尚未完整上传，请重新选择');
      const chunk = decode(row.base64, CHUNK_BYTES);
      if (chunk.length !== Math.min(CHUNK_BYTES, current.size - index * CHUNK_BYTES)) throw Error('图片分段大小不正确');
      return chunk;
    });
    const buffer = Buffer.concat(chunks);
    if (buffer.length !== current.size) throw Error('图片大小不匹配');
    // 以实际完整文件为准再次校验，不能通过伪造 size 或拆分请求绕过上限。
    const result = await storeImage(repo, storage, validateBuffer(buffer));
    // 文件登记成功后，暂存清理失败不应让用户误以为上传失败。
    await repo.clearImageUpload(event.uploadId, count).catch(() => {});
    return result;
  }
  throw Error('不支持的图片操作');
}

module.exports = {MAX_IMAGE_BYTES, CHUNK_BYTES, UPLOAD_TTL, image, runUpload, storeImage};
