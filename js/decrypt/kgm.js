/**
 * 酷狗音乐 KGM/KGMA/VPR 解密（WASM）
 * 算法参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  var VprHeader = [0x05, 0x28, 0xbc, 0x96, 0xe9, 0xe4, 0x5a, 0x43, 0x91, 0xaa, 0xbd, 0xd0, 0x7a, 0xf5, 0x36, 0x31];
  var KgmHeader = [0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b, 0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99, 0x14];

  UM.kgm = {
    decrypt: function (buf, rawFilename, rawExt) {
      var oriData = new Uint8Array(buf);
      if (rawExt === 'vpr') {
        if (!utils.bytesHasPrefix(oriData, VprHeader)) throw new Error('不是有效的 vpr 文件');
      } else {
        if (!utils.bytesHasPrefix(oriData, KgmHeader)) throw new Error('不是有效的 kgm(a) 文件');
      }

      return UM.wasmdec.decryptKgm(buf, rawExt).then(function (result) {
        var musicDecoded = result.data;
        var ext = utils.sniffAudioExt(musicDecoded);
        var meta = UM.metadata.parseMetadata(musicDecoded, ext);
        var info = utils.getMetaFromFile(rawFilename, meta.title, meta.artist);
        return {
          title: info.title,
          artist: info.artist,
          album: meta.album,
          ext: ext,
          mime: utils.AudioMimeType[ext] || 'application/octet-stream',
          data: musicDecoded,
          picture: meta.picture,
        };
      });
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = UM.kgm;
})();
