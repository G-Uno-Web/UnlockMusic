/**
 * QMC 系列解密入口（含 QQ音乐/Moo音乐/微云 全部后缀）
 * 算法参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  var HandlerMap = {
    mgg: { ext: 'ogg' }, mgg0: { ext: 'ogg' }, mggl: { ext: 'ogg' }, mgg1: { ext: 'ogg' },
    mflac: { ext: 'flac' }, mflac0: { ext: 'flac' }, mflach: { ext: 'flac' }, mmp4: { ext: 'mp4' },
    qmcflac: { ext: 'flac' }, qmcogg: { ext: 'ogg' },
    qmc0: { ext: 'mp3' }, qmc2: { ext: 'ogg' }, qmc3: { ext: 'mp3' },
    qmc4: { ext: 'ogg' }, qmc6: { ext: 'ogg' }, qmc8: { ext: 'ogg' },
    bkcmp3: { ext: 'mp3' }, bkcm4a: { ext: 'm4a' }, bkcflac: { ext: 'flac' },
    bkcwav: { ext: 'wav' }, bkcape: { ext: 'ape' }, bkcogg: { ext: 'ogg' }, bkcwma: { ext: 'wma' },
    tkm: { ext: 'm4a' },
    '666c6163': { ext: 'flac' }, '6d7033': { ext: 'mp3' }, '6f6767': { ext: 'ogg' },
    '6d3461': { ext: 'm4a' }, '776176': { ext: 'wav' },
    cache: { ext: '' }, // QQ 音乐缓存
  };

  UM.qmc = {
    HandlerMap: HandlerMap,
    decrypt: function (buf, rawFilename, rawExt) {
      var handler = HandlerMap[rawExt];
      if (!handler) throw new Error('不支持的 QMC 格式: ' + rawExt);
      var self = this;

      return UM.wasmdec.decryptQmc(buf, rawExt).then(function (result) {
        var musicDecoded = result.data;
        var ext = utils.sniffAudioExt(musicDecoded, handler.ext);
        var newName = utils.splitFilename(rawFilename);

        // QQ 音乐缓存：若嗅探不出格式且原始后缀本身是加密格式，则递归处理
        if (rawExt === 'cache' && ext === '' && HandlerMap[newName.ext]) {
          return self.decrypt(musicDecoded.buffer, newName.name, newName.ext);
        }
        if (rawExt === 'cache' && ext === '' && newName.ext !== 'mp3') {
          throw new Error('不支持的 QQ 音乐缓存格式');
        }
        if (rawExt === 'cache' && ext === '') ext = 'mp3';

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
  if (typeof module === 'object' && module.exports) module.exports = UM.qmc;
})();
