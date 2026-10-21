// 无第三方依赖：生成能正常解码的 PNG，并通过合法 ancillary chunk 调整精确文件字节数。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(size) {
  const header = Buffer.alloc(13); header.writeUInt32BE(64, 0); header.writeUInt32BE(64, 4);
  header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(64 * (1 + 64 * 3));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = y * 193 + 1 + x * 3;
    const color = ((x >> 3) + (y >> 3)) % 2 ? [53, 123, 85] : [244, 221, 167];
    pixels.set(color, i);
  }
  const start = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels))]);
  const end = chunk('IEND', Buffer.alloc(0));
  if (!size) return Buffer.concat([start, end]);
  if (size < start.length + end.length + 12) throw Error('Fixture size too small');
  return Buffer.concat([start, chunk('npAD', Buffer.alloc(size - start.length - end.length - 12)), end]);
}
if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, 'fixtures'));
  fs.mkdirSync(dir, {recursive: true});
  for (const [name, size] of [['under-5MB.png', 5*1024*1024-1], ['exactly-5MB.png', 5*1024*1024], ['over-5MB.png', 5*1024*1024+1]]) {
    fs.writeFileSync(path.join(dir, name), png(size)); console.log(name + ': ' + size + ' bytes');
  }
}
module.exports = {png};
