/**
 * 酷我音乐 KWM 解密
 * 算法参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  var MAGIC_HEADER = [0x79, 0x65, 0x65, 0x6c, 0x69, 0x6f, 0x6e, 0x2d, 0x6b, 0x75, 0x77, 0x6f, 0x2d, 0x74, 0x6d, 0x65]; // "yeelion-kuwo-tme"
  var MAGIC_HEADER2 = [0x79, 0x65, 0x65, 0x6c, 0x69, 0x6f, 0x6e, 0x2d, 0x6b, 0x75, 0x77, 0x6f, 0x00, 0x00, 0x00, 0x00];
  var PRE_DEFINED_KEY = 'MoOtOiTvINGwd2E6n0E1i7L5t2IoOoNk';

  function trimKey(keyRaw) {
    if (keyRaw.length > 32) return keyRaw.slice(0, 32);
    if (keyRaw.length < 32) return keyRaw.padEnd(32, keyRaw);
    return keyRaw;
  }

  function createMaskFromKey(keyBytes) {
    var dv = new DataView(keyBytes.buffer, keyBytes.byteOffset, keyBytes.byteLength);
    var keyStr = dv.getBigUint64(0, true).toString();
    var keyStrTrim = trimKey(keyStr);
    var key = new Uint8Array(32);
    for (var i = 0; i < 32; i++) {
      key[i] = PRE_DEFINED_KEY.charCodeAt(i) ^ keyStrTrim.charCodeAt(i);
    }
    return key;
  }

  UM.kwm = {
    decrypt: function (buf, rawFilename, rawExt) {
      var oriData = new Uint8Array(buf);
      if (!utils.bytesHasPrefix(oriData, MAGIC_HEADER) && !utils.bytesHasPrefix(oriData, MAGIC_HEADER2)) {
        if (utils.sniffAudioExt(oriData, '') === 'aac') {
          return UM.raw.decrypt(oriData.buffer, rawFilename, 'aac', false);
        }
        throw new Error('不是有效的 kwm 文件');
      }

      var fileKey = oriData.slice(0x18, 0x20);
      var mask = createMaskFromKey(fileKey);
      var audioData = oriData.slice(0x400);
      var len = audioData.length;
      var CHUNK = 4 * 1024 * 1024;
      for (var cur = 0; cur < len; cur++) {
        audioData[cur] ^= mask[cur % 0x20];
        if ((cur & (CHUNK - 1)) === CHUNK - 1) utils.reportProgress({ stage: 'decrypt', pct: cur / len });
      }

      var ext = utils.sniffAudioExt(audioData);
      var mime = utils.AudioMimeType[ext];
      var meta = UM.metadata.parseMetadata(audioData, ext);
      var info = utils.getMetaFromFile(rawFilename, meta.title, meta.artist);

      return {
        title: info.title,
        artist: info.artist,
        album: meta.album,
        ext: ext,
        mime: mime,
        data: audioData,
        picture: meta.picture,
      };
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = UM.kwm;
})();
