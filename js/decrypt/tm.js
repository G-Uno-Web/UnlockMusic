/**
 * QQ 音乐 iOS tm 格式解密
 * - tm0/tm3: MP3（无需处理，直接直通）
 * - tm2/tm6: M4A（修复文件头 8 字节）
 * 算法参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  var TM_HEADER = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70];

  UM.tm = {
    decrypt: function (buf, rawFilename) {
      var audioData = new Uint8Array(buf);
      for (var cur = 0; cur < 8; cur++) {
        audioData[cur] = TM_HEADER[cur];
      }
      return UM.raw.decrypt(audioData.buffer, rawFilename, 'm4a', false);
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = UM.tm;
})();
