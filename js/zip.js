/**
 * 极简 ZIP 打包器（仅存储，不压缩 —— 音频文件本身已压缩）
 * 用于「全部下载」功能
 */
(function () {
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function utf8Bytes(str) { return new TextEncoder().encode(str); }

  /**
   * 生成 ZIP (store-only)
   * @param {Array<{name: string, data: Uint8Array}>} files
   * @returns {Blob}
   */
  function createZip(files) {
    var chunks = [];
    var centralDir = [];
    var offset = 0;

    files.forEach(function (f) {
      var nameBytes = utf8Bytes(f.name);
      var crc = crc32(f.data);

      // Local file header
      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);   // signature
      lv.setUint16(4, 20, true);           // version needed
      lv.setUint16(6, 0x0800, true);       // flags: UTF-8
      lv.setUint16(8, 0, true);            // method: store
      lv.setUint16(10, 0, true);           // mod time
      lv.setUint16(12, 0x21, true);        // mod date (1996-01-01)
      lv.setUint32(14, crc, true);
      lv.setUint32(18, f.data.length, true);
      lv.setUint32(22, f.data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, f.data);

      // Central directory record
      var cd = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, f.data.length, true);
      cv.setUint32(24, f.data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true); // extra
      cv.setUint16(32, 0, true); // comment
      cv.setUint16(34, 0, true); // disk
      cv.setUint16(36, 0, true); // internal attrs
      cv.setUint32(38, 0, true); // external attrs
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      centralDir.push(cd);

      offset += local.length + f.data.length;
    });

    var centralSize = 0;
    centralDir.forEach(function (c) { centralSize += c.length; });

    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob(chunks.concat(centralDir).concat([end]), { type: 'application/zip' });
  }

  if (typeof window !== 'undefined') window.createZip = createZip;
  else if (typeof self !== 'undefined') self.createZip = createZip;
  if (typeof module === 'object' && module.exports) module.exports = { createZip: createZip, crc32: crc32 };
})();
