/**
 * QQ 音乐 QMC 系列 & 酷狗 KGM 系列解密（WASM 加速）
 * 使用与 unlock-music 官方版本相同的 WASM 二进制
 * (@xhacker/qmcwasm & @xhacker/kgmwasm, Apache-2.0 License)
 * 调用逻辑参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  var BUF_SIZE = 2 * 1024 * 1024; // 每次处理 2MB
  var qmcModulePromise = null;
  var kgmModulePromise = null;

  function getQmcModule() {
    if (!qmcModulePromise) {
      qmcModulePromise = (typeof importScripts === 'function'
        ? Promise.resolve(self.QmcCryptoModule())
        : Promise.reject(new Error('WebAssembly 不可用')));
    }
    return qmcModulePromise;
  }

  function getKgmModule() {
    if (!kgmModulePromise) {
      kgmModulePromise = (typeof importScripts === 'function'
        ? Promise.resolve(self.KgmCryptoModule())
        : Promise.reject(new Error('WebAssembly 不可用')));
    }
    return kgmModulePromise;
  }

  // Node 环境加载（供测试）
  function loadForNode() {
    if (typeof require === 'function' && typeof importScripts !== 'function') {
      self = globalThis;
      globalThis.QmcCryptoModule = require('../lib/wasm/qmcwasm-bundle.js');
      globalThis.KgmCryptoModule = require('../lib/wasm/kgmwasm-bundle.js');
      qmcModulePromise = Promise.resolve(globalThis.QmcCryptoModule());
      kgmModulePromise = Promise.resolve(globalThis.KgmCryptoModule());
    }
  }

  function mergeParts(parts) {
    return utils.concatBytes(parts);
  }

  /**
   * 解密 QMC 文件（qmc0/qmcflac/mflac/mgg/bkcmp3/... 全系列）
   * @returns {Promise<{data: Uint8Array, songId}>}
   */
  function decryptQmc(fileBuffer, ext) {
    return getQmcModule().then(function (Qmc) {
      var qmcBuf = new Uint8Array(fileBuffer);
      var pBuf = Qmc._malloc(BUF_SIZE);
      try {
        var preDecSize = Math.min(BUF_SIZE, qmcBuf.length);
        Qmc.HEAPU8.set(qmcBuf.subarray(qmcBuf.length - preDecSize), pBuf);

        var tailSize = Qmc.preDec(pBuf, preDecSize, '.' + ext);
        if (tailSize === -1) {
          throw new Error(Qmc.getErr() || 'QMC 解密初始化失败');
        }
        var songId = Qmc.getSongId();
        if (songId === '0') songId = 0;

        var parts = [];
        var offset = 0;
        var bytesToDecrypt = qmcBuf.length - tailSize;
        while (bytesToDecrypt > 0) {
          var blockSize = Math.min(bytesToDecrypt, BUF_SIZE);
          Qmc.HEAPU8.set(qmcBuf.subarray(offset, offset + blockSize), pBuf);
          var decSize = Qmc.decBlob(pBuf, blockSize, offset);
          parts.push(Qmc.HEAPU8.slice(pBuf, pBuf + decSize));
          offset += blockSize;
          bytesToDecrypt -= blockSize;
          utils.reportProgress({ stage: 'decrypt', pct: offset / (qmcBuf.length - tailSize) });
        }
        return { data: mergeParts(parts), songId: songId };
      } finally {
        Qmc._free(pBuf);
      }
    });
  }

  /**
   * 解密 KGM/KGMA/VPR 文件
   * @returns {Promise<{data: Uint8Array}>}
   */
  function decryptKgm(fileBuffer, ext) {
    return getKgmModule().then(function (Kgm) {
      var kgmBuf = new Uint8Array(fileBuffer);
      var pBuf = Kgm._malloc(BUF_SIZE);
      try {
        var preDecSize = Math.min(BUF_SIZE, kgmBuf.length);
        Kgm.HEAPU8.set(kgmBuf.subarray(0, preDecSize), pBuf);

        var headerSize = Kgm.preDec(pBuf, preDecSize, ext);
        if (headerSize === -1) {
          throw new Error(Kgm.getErr ? Kgm.getErr() : 'KGM 解密初始化失败');
        }
        kgmBuf = kgmBuf.subarray(headerSize);

        var parts = [];
        var offset = 0;
        var bytesToDecrypt = kgmBuf.length;
        while (bytesToDecrypt > 0) {
          var blockSize = Math.min(bytesToDecrypt, BUF_SIZE);
          Kgm.HEAPU8.set(kgmBuf.subarray(offset, offset + blockSize), pBuf);
          Kgm.decBlob(pBuf, blockSize, offset);
          parts.push(Kgm.HEAPU8.slice(pBuf, pBuf + blockSize));
          offset += blockSize;
          bytesToDecrypt -= blockSize;
          utils.reportProgress({ stage: 'decrypt', pct: offset / kgmBuf.length });
        }
        return { data: mergeParts(parts) };
      } finally {
        Kgm._free(pBuf);
      }
    });
  }

  UM.wasmdec = {
    decryptQmc: decryptQmc,
    decryptKgm: decryptKgm,
    loadForNode: loadForNode,
  };
  if (typeof module === 'object' && module.exports) module.exports = UM.wasmdec;
})();
