'use strict';
// 文件字节数上限，不是 Base64 字符串长度。等于上限也拒绝。
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CHUNK_BYTES = 192 * 1024;
const SIZE_MESSAGE = '这张图片太大啦，单张图片必须小于5MB（不含5MB）。请压缩后重新选择，或换一张较小的图片。';

function checkSize(size) {
  if (!Number.isInteger(size) || size <= 0) throw Error('无法确认图片大小，请重新选择图片。');
  if (size >= MAX_IMAGE_BYTES) throw Error(SIZE_MESSAGE);
  return size;
}

async function readImage(file) {
  if (!file || !file.tempFilePath) throw Error('没有选到图片，请重新选择。');
  // 选择器缺少 size 时继续读取文件信息，不能据此放行上传。
  if (file.size !== undefined) checkSize(file.size);
  const fs = wx.getFileSystemManager();
  const info = await new Promise((resolve, reject) => fs.getFileInfo({
    filePath: file.tempFilePath, success: resolve, fail: reject
  }));
  checkSize(info.size);
  const result = await new Promise((resolve, reject) => fs.readFile({
    filePath: file.tempFilePath, success: resolve, fail: reject
  }));
  const buffer = result.data;
  if (!(buffer instanceof ArrayBuffer)) throw Error('图片读取失败，请重新选择。');
  checkSize(buffer.byteLength);
  const bytes = new Uint8Array(buffer);
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 12 || !(png.every((v, i) => bytes[i] === v) ||
      (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))) {
    throw Error('请选择JPEG或PNG格式的图片，其他格式请先转换后再选择。');
  }
  return buffer;
}

async function uploadImage(buffer, call, progress = () => {}) {
  checkSize(buffer.byteLength);
  let uploadId;
  try {
    const started = await call('beginImageUpload', {size: buffer.byteLength});
    uploadId = started.uploadId;
    const count = Math.ceil(buffer.byteLength / CHUNK_BYTES);
    for (let index = 0; index < count; index++) {
      const chunk = buffer.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
      await call('uploadImageChunk', {uploadId, index, base64: wx.arrayBufferToBase64(chunk)});
      progress(Math.round((index + 1) / count * 90));
    }
    const result = await call('finishImageUpload', {uploadId});
    progress(100);
    return result;
  } catch (error) {
    // 仅清理本次未完成的暂存分段，绝不删除菜品已引用的文件。
    if (uploadId) await call('abortImageUpload', {uploadId}).catch(() => {});
    throw error;
  }
}

module.exports = {MAX_IMAGE_BYTES, CHUNK_BYTES, SIZE_MESSAGE, checkSize, readImage, uploadImage};
