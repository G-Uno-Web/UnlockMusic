/**
 * 解密调度器：按扩展名分发到对应的解密模块
 * 支持的格式与 unlock-music (https://demo.unlock-music.dev/) 一致
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  // 各扩展名 -> 处理器
  var SUPPORTED = {
    // QQ 音乐（WASM）
    qmc0: 'qmc', qmc2: 'qmc', qmc3: 'qmc', qmc4: 'qmc', qmc6: 'qmc', qmc8: 'qmc',
    qmcflac: 'qmc', qmcogg: 'qmc', tkm: 'qmc', cache: 'qmc',
    mflac: 'qmc', mflac0: 'qmc', mflach: 'qmc',
    mgg: 'qmc', mgg0: 'qmc', mgg1: 'qmc', mggl: 'qmc', mmp4: 'qmc',
    '666c6163': 'qmc', '6d7033': 'qmc', '6f6767': 'qmc', '6d3461': 'qmc', '776176': 'qmc',
    // QQ 音乐 iOS
    tm0: 'tm', tm3: 'tm', tm2: 'tm2', tm6: 'tm2',
    // Moo 音乐
    bkcmp3: 'qmc', bkcm4a: 'qmc', bkcflac: 'qmc', bkcwav: 'qmc',
    bkcape: 'qmc', bkcogg: 'qmc', bkcwma: 'qmc',
    // 网易云
    ncm: 'ncm', uc: 'ncmcache',
    // 酷狗（WASM）
    kgm: 'kgm', kgma: 'kgm', vpr: 'kgm',
    // 酷我
    kwm: 'kwm',
    // 虾米（含普通格式直通）
    xm: 'xm', wav: 'xm', mp3: 'xm', flac: 'xm', m4a: 'xm',
    ogg: 'raw',
    // 咪咕
    mg3d: 'mg3d',
    // 喜马拉雅
    x2m: 'ximalaya', x3m: 'ximalaya',
    // JOOX 海外版（需要 UUID 密钥，暂不支持，提示用户）
    ofl_en: 'joox',
  };

  var FORMAT_NAMES = {
    qmc: 'QQ音乐', tm: 'QQ音乐(iOS)', tm2: 'QQ音乐(iOS)', ncm: '网易云音乐',
    ncmcache: '网易云缓存', kgm: '酷狗音乐', kwm: '酷我音乐', xm: '虾米音乐',
    raw: '原始格式', mg3d: '咪咕音乐', ximalaya: '喜马拉雅', joox: 'JOOX',
  };

  function decryptXimalaya(buf, filename, ext) {
    var data = UM.ximalaya[ext](new Uint8Array(buf));
    var sniffExt = utils.sniffAudioExt(data, 'm4a');
    var meta = UM.metadata.parseMetadata(data, sniffExt);
    var info = utils.getMetaFromFile(filename, meta.title, meta.artist);
    return {
      title: info.title, artist: info.artist, album: meta.album,
      ext: sniffExt, mime: utils.AudioMimeType[sniffExt] || 'application/octet-stream',
      data: data, picture: meta.picture,
    };
  }

  UM.index = {
    supportedExtensions: Object.keys(SUPPORTED),
    isSupported: function (ext) { return Object.prototype.hasOwnProperty.call(SUPPORTED, ext); },

    /**
     * 解密入口
     * @param {ArrayBuffer} buf 文件内容
     * @param {string} filename 原始文件名（不含扩展名）
     * @param {string} ext 扩展名（小写）
     * @returns {Promise<object>} 解密结果 {title, artist, album, ext, mime, data, picture}
     */
    decrypt: function (buf, filename, ext, options) {
      options = options || {};
      var handler = SUPPORTED[ext];
      if (!handler) return Promise.reject(new Error('不支持此文件格式'));

      if (handler === 'joox') {
        return Promise.reject(new Error('JOOX (ofl_en) 需要提供应用 UUID，暂不支持，请使用官方 CLI 版本'));
      }

      utils.reportProgress({ stage: 'start', pct: 0 });
      var result;
      try {
        switch (handler) {
          case 'qmc': result = UM.qmc.decrypt(buf, filename, ext); break;
          case 'kgm': result = UM.kgm.decrypt(buf, filename, ext); break;
          case 'ncm': result = Promise.resolve(UM.ncm.decrypt(buf, filename, options)); break;
          case 'ncmcache': result = Promise.resolve(UM.ncmcache.decrypt(buf, filename, ext)); break;
          case 'kwm': result = Promise.resolve(UM.kwm.decrypt(buf, filename, ext)); break;
          case 'xm': result = Promise.resolve(UM.xm.decrypt(buf, filename, ext)); break;
          case 'raw': result = Promise.resolve(UM.raw.decrypt(buf, filename, ext, true)); break;
          case 'tm': result = Promise.resolve(UM.raw.decrypt(buf, filename, 'mp3', false)); break;
          case 'tm2': result = Promise.resolve(UM.tm.decrypt(buf, filename)); break;
          case 'mg3d': result = Promise.resolve(UM.mg3d.decrypt(buf, filename)); break;
          case 'ximalaya': result = Promise.resolve(decryptXimalaya(buf, filename, ext)); break;
          default: return Promise.reject(new Error('未知处理器'));
        }
      } catch (e) {
        result = Promise.reject(e);
      }

      return result.then(function (r) {
        utils.reportProgress({ stage: 'done', pct: 1 });
        r.rawExt = ext;
        r.rawFilename = filename;
        return r;
      });
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = UM.index;
})();
