/**
 * 解密 Worker：在后台线程执行解密，避免阻塞 UI
 */
/* global importScripts, self, UM */
importScripts(
  'decrypt/utils.js',
  'decrypt/aes.js',
  'decrypt/metadata.js',
  'decrypt/id3writer.js',
  'decrypt/flacwriter.js',
  'decrypt/raw.js',
  'decrypt/ncm.js',
  'decrypt/misc.js',
  'decrypt/tm.js',
  'decrypt/kwm.js',
  'decrypt/xm.js',
  'decrypt/ximalaya.js',
  'decrypt/qmc.js',
  'decrypt/kgm.js',
  'decrypt/wasmdec.js',
  'lib/wasm/qmcwasm-bundle.js',
  'lib/wasm/kgmwasm-bundle.js',
  'decrypt/index.js'
);

var UM = self.UM;

UM.utils.setProgressHook(function (p) {
  self.postMessage({ type: 'progress', id: currentId, stage: p.stage, pct: p.pct });
});

var currentId = null;

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.type !== 'decrypt') return;
  currentId = msg.id;
  var ext = msg.name.substring(msg.name.lastIndexOf('.') + 1).toLowerCase();
  var baseName = msg.name.substring(0, msg.name.lastIndexOf('.'));

  Promise.resolve()
    .then(function () {
      if (!UM.index.isSupported(ext)) throw new Error('不支持此文件格式: .' + ext);
      return UM.index.decrypt(msg.buffer, baseName, ext, { fetchCover: msg.fetchCover });
    })
    .then(function (result) {
      var payload = {
        type: 'result', id: msg.id,
        title: result.title || '',
        artist: result.artist || '',
        album: result.album || '',
        ext: result.ext,
        mime: result.mime,
        buffer: result.data.buffer,
        picture: result.picture ? { mime: result.picture.mime, buffer: result.picture.data.buffer } : null,
        pictureUrl: result.pictureUrl || '',
        rawExt: result.rawExt,
      };
      var transfer = [payload.buffer];
      if (payload.picture) transfer.push(payload.picture.buffer);
      currentId = null;
      self.postMessage(payload, transfer);
    })
    .catch(function (err) {
      currentId = null;
      self.postMessage({
        type: 'error', id: msg.id,
        message: (err && err.message) ? err.message : String(err),
      });
    });
};
