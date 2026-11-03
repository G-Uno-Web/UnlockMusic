/**
 * 通用工具：格式嗅探、MIME、文件名解析等
 * 算法参考自 unlock-music (MIT License, https://git.um-react.app/um/web)
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});

  var MP3_HEADER = [0x49, 0x44, 0x33];
  var FLAC_HEADER = [0x66, 0x4c, 0x61, 0x43];
  var OGG_HEADER = [0x4f, 0x67, 0x67, 0x53];
  var M4A_HEADER = [0x66, 0x74, 0x79, 0x70];
  var WMA_HEADER = [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c];
  var WAV_HEADER = [0x52, 0x49, 0x46, 0x46];
  var AAC_HEADER = [0xff, 0xf1];
  var DFF_HEADER = [0x46, 0x52, 0x4d, 0x38];

  var AudioMimeType = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    wma: 'audio/x-ms-wma',
    wav: 'audio/x-wav',
    aac: 'audio/aac',
    dff: 'audio/x-dff',
  };

  function bytesHasPrefix(data, prefix) {
    if (prefix.length > data.length) return false;
    for (var i = 0; i < prefix.length; i++) if (prefix[i] !== data[i]) return false;
    return true;
  }

  function sniffAudioExt(data, fallbackExt) {
    if (fallbackExt === undefined) fallbackExt = 'mp3';
    if (bytesHasPrefix(data, MP3_HEADER)) return 'mp3';
    if (bytesHasPrefix(data, FLAC_HEADER)) return 'flac';
    if (bytesHasPrefix(data, OGG_HEADER)) return 'ogg';
    if (data.length >= 8 && bytesHasPrefix(data.slice(4, 8), M4A_HEADER)) return 'm4a';
    if (bytesHasPrefix(data, WAV_HEADER)) return 'wav';
    if (bytesHasPrefix(data, WMA_HEADER)) return 'wma';
    if (bytesHasPrefix(data, AAC_HEADER)) return 'aac';
    if (bytesHasPrefix(data, DFF_HEADER)) return 'dff';
    return fallbackExt;
  }

  var SPLIT_REGEX = /[ ]?[,;/_、][ ]?/;

  // 由文件名补充缺失的歌手/标题信息
  function getMetaFromFile(filename, existTitle, existArtist, separator) {
    if (separator === undefined) separator = '-';
    var meta = { title: existTitle || '', artist: existArtist || '' };
    var items = filename.split(separator);
    if (items.length > 1) {
      if (!meta.artist || meta.artist.split(SPLIT_REGEX).length < items[0].trim().split(SPLIT_REGEX).length) {
        meta.artist = items[0].trim();
      }
      if (!meta.title) meta.title = items[1].trim();
    } else if (items.length === 1) {
      if (!meta.title) meta.title = items[0].trim();
    }
    return meta;
  }

  function splitFilename(n) {
    var pos = n.lastIndexOf('.');
    return { ext: n.substring(pos + 1).toLowerCase(), name: n.substring(0, pos) };
  }

  // 进度回调透传
  var progressHook = null;
  function reportProgress(fn) { try { if (progressHook) progressHook(fn); } catch (e) { /* noop */ } }

  function concatBytes(parts) {
    var total = 0;
    for (var i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < parts.length; j++) { out.set(parts[j], off); off += parts[j].length; }
    return out;
  }

  function utf8Decode(bytes) {
    // TextDecoder 在 Worker 与 Node (>=11) 均可用
    return new TextDecoder('utf-8').decode(bytes);
  }

  UM.utils = {
    bytesHasPrefix: bytesHasPrefix,
    sniffAudioExt: sniffAudioExt,
    AudioMimeType: AudioMimeType,
    getMetaFromFile: getMetaFromFile,
    splitFilename: splitFilename,
    concatBytes: concatBytes,
    utf8Decode: utf8Decode,
    setProgressHook: function (fn) { progressHook = fn; },
    reportProgress: reportProgress,
    HEADERS: {
      mp3: MP3_HEADER, flac: FLAC_HEADER, ogg: OGG_HEADER, m4a: M4A_HEADER,
      wma: WMA_HEADER, wav: WAV_HEADER, aac: AAC_HEADER,
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = UM.utils;
})();
