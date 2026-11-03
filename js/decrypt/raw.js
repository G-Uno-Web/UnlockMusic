/**
 * 原始音频直通（mp3/flac/wav/m4a/ogg 等）：仅解析元数据用于展示
 * 算法参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  UM.raw = {
    decrypt: function (buf, rawFilename, rawExt, detect) {
      var data = new Uint8Array(buf);
      var ext = rawExt;
      if (detect) {
        ext = utils.sniffAudioExt(data, rawExt);
      }
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
  if (typeof module === 'object' && module.exports) module.exports = UM.raw;
})();
