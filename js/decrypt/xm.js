/**
 * 虾米音乐 XM 解密 & 原始格式直通
 * 算法参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  var MAGIC_HEADER = [0x69, 0x66, 0x6d, 0x74]; // "ifmt"
  var MAGIC_HEADER2 = [0xfe, 0xfe, 0xfe, 0xfe];
  var FileTypeMap = {
    ' WAV': 'wav',
    FLAC: 'flac',
    ' MP3': 'mp3',
    ' A4M': 'm4a',
  };

  UM.xm = {
    decrypt: function (buf, rawFilename, rawExt) {
      var oriData = new Uint8Array(buf);
      var isXm = utils.bytesHasPrefix(oriData, MAGIC_HEADER) && utils.bytesHasPrefix(oriData.subarray(8, 12), MAGIC_HEADER2);
      if (!isXm) {
        if (rawExt === 'xm') throw new Error('此 xm 文件已损坏');
        return UM.raw.decrypt(buf, rawFilename, rawExt, true);
      }

      var typeText = '';
      for (var i = 4; i < 8; i++) typeText += String.fromCharCode(oriData[i]);
      if (!FileTypeMap.hasOwnProperty(typeText)) throw new Error('未知的 xm 文件类型');

      var key = oriData[0xf];
      var dataOffset = oriData[0xc] | (oriData[0xd] << 8) | (oriData[0xe] << 16);
      var audioData = oriData.slice(0x10);
      var len = audioData.length;
      for (var cur = dataOffset; cur < len; cur++) {
        audioData[cur] = ((audioData[cur] - key) & 0xff) ^ 0xff;
      }

      var ext = FileTypeMap[typeText];
      var mime = utils.AudioMimeType[ext];
      var meta = UM.metadata.parseMetadata(audioData, ext);
      if (ext === 'wav') { meta.title = ''; meta.artist = ''; meta.album = ''; }
      var sep = rawFilename.indexOf('_') === -1 ? '-' : '_';
      var info = utils.getMetaFromFile(rawFilename, meta.title, meta.artist, sep);

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
  if (typeof module === 'object' && module.exports) module.exports = UM.xm;
})();
