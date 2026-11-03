/**
 * 网易云音乐缓存文件 (.uc) 解密：整体 XOR 0xA3
 * 咪咕音乐 mg3d 解密：分段减法密钥
 * 算法参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  // ---- 网易云缓存 .uc ----
  UM.ncmcache = {
    decrypt: function (buf, rawFilename, rawExt) {
      var data = new Uint8Array(buf);
      for (var i = 0; i < data.length; i++) data[i] ^= 163;
      var ext = utils.sniffAudioExt(data, rawExt);
      var meta = UM.metadata.parseMetadata(data, ext);
      var info = utils.getMetaFromFile(rawFilename, meta.title, meta.artist);
      return {
        title: info.title,
        artist: info.artist,
        album: meta.album,
        ext: ext,
        mime: utils.AudioMimeType[ext] || 'application/octet-stream',
        data: data,
        picture: meta.picture,
      };
    },
  };

  // ---- 咪咕 mg3d ----
  var SEGMENT_SIZE = 0x20;

  function isUpperHexChar(ch) {
    return (ch >= 0x30 && ch <= 0x39) || (ch >= 0x41 && ch <= 0x46);
  }
  function isPrintableAsciiChar(ch) {
    return ch >= 0x20 && ch <= 0x7e;
  }
  function bytesEqualStr(data, str, off) {
    for (var i = 0; i < str.length; i++) {
      if (data[off + i] !== str.charCodeAt(i)) return false;
    }
    return true;
  }
  function decryptSegment(data, key) {
    for (var i = 0; i < data.length; i++) {
      data[i] = (data[i] - key[i % SEGMENT_SIZE]) & 0xff;
    }
    return data;
  }

  UM.mg3d = {
    decrypt: function (buf, rawFilename) {
      var data = new Uint8Array(buf);
      // 咪咕编码的 WAV 文件头部有大量“空洞”，在后续分段中寻找密钥
      var header = data.slice(0, 0x100);
      var possibleKeys = [];

      for (var i = SEGMENT_SIZE; i < SEGMENT_SIZE * 20; i += SEGMENT_SIZE) {
        var possibleKey = data.subarray(i, i + SEGMENT_SIZE);
        if (possibleKey.length < SEGMENT_SIZE) break;
        var ok = true;
        for (var c = 0; c < SEGMENT_SIZE; c++) {
          if (!isUpperHexChar(possibleKey[c])) { ok = false; break; }
        }
        if (!ok) continue;

        var tempHeader = decryptSegment(header.slice(), possibleKey);
        if (!bytesEqualStr(tempHeader, 'RIFF', 0)) continue;
        if (!bytesEqualStr(tempHeader, 'WAVEfmt ', 8)) continue;

        var dv = new DataView(tempHeader.buffer);
        var fmtChunkSize = dv.getUint32(0x10, true);
        if ([16, 18, 40].indexOf(fmtChunkSize) === -1) continue;

        var firstDataChunkOffset = 0x14 + fmtChunkSize;
        var chunkNameOk = true;
        for (var n = 0; n < 4; n++) {
          if (!isPrintableAsciiChar(tempHeader[firstDataChunkOffset + n])) { chunkNameOk = false; break; }
        }
        if (!chunkNameOk) continue;

        possibleKeys.push(possibleKey.slice());
        break; // 取第一个可用密钥即可
      }

      if (possibleKeys.length === 0) throw new Error('未能找到有效的咪咕解密密钥');
      decryptSegment(data, possibleKeys[0]);

      return UM.raw.decrypt(data.buffer, rawFilename, 'wav', false);
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = { ncmcache: UM.ncmcache, mg3d: UM.mg3d };
})();
