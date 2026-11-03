/**
 * 网易云音乐 NCM 解密
 * 算法参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  var CORE_KEY = new Uint8Array([0x68, 0x7a, 0x48, 0x52, 0x41, 0x6d, 0x73, 0x6f, 0x35, 0x6b, 0x49, 0x6e, 0x62, 0x61, 0x78, 0x57]);
  var META_KEY = new Uint8Array([0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21, 0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28]);
  var MAGIC_HEADER = [0x43, 0x54, 0x45, 0x4e, 0x46, 0x44, 0x41, 0x4d]; // "CTENFDAM"

  function NcmDecrypt(buf, filename, options) {
    this.raw = buf;
    this.view = new DataView(buf);
    this.filename = filename;
    this.options = options || {};
    this.offset = 10;
    if (!utils.bytesHasPrefix(new Uint8Array(buf, 0, 8), MAGIC_HEADER)) throw new Error('此 ncm 文件已损坏');
  }

  NcmDecrypt.prototype._getKeyData = function () {
    var keyLen = this.view.getUint32(this.offset, true);
    this.offset += 4;
    var cipherText = new Uint8Array(this.raw, this.offset, keyLen);
    for (var i = 0; i < keyLen; i++) cipherText[i] ^= 0x64;
    this.offset += keyLen;
    // AES-128-ECB 解密（含 PKCS7）
    var plain = UM.aes.decryptECB(cipherText, CORE_KEY);
    // 跳过前缀 "neteasecloudmusic"
    return plain.slice(17);
  };

  NcmDecrypt.prototype._getKeyBox = function () {
    var keyData = this._getKeyData();
    var box = new Uint8Array(256);
    for (var i = 0; i < 256; i++) box[i] = i;
    var keyDataLen = keyData.length;
    var j = 0;
    for (var k = 0; k < 256; k++) {
      j = (box[k] + j + keyData[k % keyDataLen]) & 0xff;
      var t = box[k]; box[k] = box[j]; box[j] = t;
    }
    // 生成最终流密钥
    var result = new Uint8Array(256);
    for (var m = 0; m < 256; m++) {
      var idx = (m + 1) & 0xff;
      var si = box[idx];
      var sj = box[(idx + si) & 0xff];
      result[m] = box[(si + sj) & 0xff];
    }
    return result;
  };

  NcmDecrypt.prototype._getMetaData = function () {
    var metaDataLen = this.view.getUint32(this.offset, true);
    this.offset += 4;
    if (metaDataLen === 0) return {};
    var cipherText = new Uint8Array(this.raw, this.offset, metaDataLen);
    for (var i = 0; i < metaDataLen; i++) cipherText[i] ^= 0x63;
    this.offset += metaDataLen;

    var str = '';
    for (var k = 22; k < metaDataLen; k++) str += String.fromCharCode(cipherText[k]);
    var binary = atob(str);
    var cipher = new Uint8Array(binary.length);
    for (var m = 0; m < binary.length; m++) cipher[m] = binary.charCodeAt(m);

    var plain = UM.aes.decryptECB(cipher, META_KEY);
    var plainText = utils.utf8Decode(plain);
    var labelIndex = plainText.indexOf(':');
    if (labelIndex < 0) return {};
    var label = plainText.slice(0, labelIndex);
    var jsonText = plainText.slice(labelIndex + 1);
    var result;
    try { result = JSON.parse(jsonText); } catch (e) { return {}; }
    if (label === 'dj' && result && result.mainMusic) result = result.mainMusic;
    if (result && result.albumPic) result.albumPic = result.albumPic.replace('http://', 'https://') + '?param=500y500';
    return result || {};
  };

  NcmDecrypt.prototype._getAudio = function (keyBox) {
    this.offset += this.view.getUint32(this.offset + 5, true) + 13;
    var audioData = new Uint8Array(this.raw, this.offset);
    var len = audioData.length;
    var CHUNK = 4 * 1024 * 1024;
    for (var cur = 0; cur < len; cur++) {
      audioData[cur] ^= keyBox[cur & 0xff];
      if ((cur & (CHUNK - 1)) === CHUNK - 1) utils.reportProgress({ stage: 'decrypt', pct: cur / len });
    }
    return audioData;
  };

  NcmDecrypt.prototype.decrypt = function () {
    var keyBox = this._getKeyBox();
    var oriMeta = this._getMetaData();
    var audio = this._getAudio(keyBox);
    var format = oriMeta.format || utils.sniffAudioExt(audio);
    var mime = utils.AudioMimeType[format] || 'application/octet-stream';

    var info = utils.getMetaFromFile(this.filename, oriMeta.musicName);
    var artists = [];
    if (typeof oriMeta.artist === 'string') {
      artists.push(oriMeta.artist);
    } else if (Array.isArray(oriMeta.artist)) {
      oriMeta.artist.forEach(function (a) {
        if (typeof a === 'string') artists.push(a);
        else if (Array.isArray(a) && a[0] && typeof a[0] === 'string') artists.push(a[0]);
      });
    }
    if (artists.length === 0 && info.artist) {
      artists = info.artist.split(',').map(function (v) { return v.trim(); }).filter(function (v) { return v !== ''; });
    }

    var picture = null;
    var pictureUrl = oriMeta.albumPic || '';
    if (this.options.fetchCover !== false && pictureUrl) {
      // 尝试在线获取封面（失败不影响解密）
      try { picture = fetchImageSync(pictureUrl); } catch (e) { picture = null; }
    }

    // 写入元数据（尽力而为）
    try {
      var existing = UM.metadata.parseMetadata(audio, format);
      var shouldWrite = !existing.album && !existing.artist && !existing.title;
      var newPicture = picture || existing.picture;
      if (shouldWrite || (picture && !existing.picture)) {
        var metaInfo = {
          title: existing.title || info.title,
          artist: existing.artist || artists.join('; '),
          artists: existing.artist ? null : artists,
          album: existing.album || oriMeta.album,
          picture: newPicture,
        };
        if (format === 'mp3') {
          audio = UM.id3writer.writeMetaToMp3(audio, metaInfo);
        } else if (format === 'flac') {
          audio = UM.flacwriter.writeMetaToFlac(audio, metaInfo);
        }
      } else if (picture && format === 'flac') {
        audio = UM.flacwriter.writeMetaToFlac(audio, {
          title: existing.title || info.title,
          artist: existing.artist || artists.join('; '),
          album: existing.album || oriMeta.album,
          picture: picture,
        });
      }
    } catch (e) {
      console.warn('write meta failed, skip.', e);
    }

    // 若文件本身无封面则展示在线封面
    var displayPicture = null;
    try {
      var after = UM.metadata.parseMetadata(audio, format);
      displayPicture = after.picture || picture;
    } catch (e) {
      displayPicture = picture;
    }

    return {
      title: info.title,
      artist: artists.join('; '),
      album: oriMeta.album,
      ext: format,
      mime: mime,
      data: audio,
      picture: displayPicture,
      pictureUrl: pictureUrl,
    };
  };

  // 同步 XHR 获取封面（Worker 中可用）
  function fetchImageSync(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false); // 同步
    xhr.responseType = 'arraybuffer'; // 必须设置，否则 response 是字符串，二进制会损坏
    try {
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        var ctype = xhr.getResponseHeader('Content-Type') || '';
        if (ctype.indexOf('image/') === 0 && xhr.response && xhr.response.byteLength > 0) {
          return { mime: ctype.split(';')[0], data: new Uint8Array(xhr.response) };
        }
      }
    } catch (e) { /* CORS 或网络失败 */ }
    return null;
  }

  UM.ncm = {
    decrypt: function (buf, filename, options) {
      return new NcmDecrypt(buf, filename, options).decrypt();
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = UM.ncm;
})();
