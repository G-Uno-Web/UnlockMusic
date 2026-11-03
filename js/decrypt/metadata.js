/**
 * 轻量音频元数据解析器（用于界面展示：标题/歌手/专辑/封面）
 * 支持: MP3(ID3v2.2/2.3/2.4)、FLAC、OGG(Vorbis/Opus)、M4A/MP4
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  function decodeText(bytes, encoding) {
    // 0: ISO-8859-1, 1: UTF-16 with BOM, 2: UTF-16BE, 3: UTF-8
    try {
      if (encoding === 0) return new TextDecoder('latin1').decode(bytes);
      if (encoding === 1) {
        if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
        if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
        return new TextDecoder('utf-16le').decode(bytes);
      }
      if (encoding === 2) return new TextDecoder('utf-16be').decode(bytes);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      return utils.utf8Decode(bytes);
    }
  }

  // ---------- ID3v2 (MP3) ----------
  function parseID3v2(data) {
    if (!utils.bytesHasPrefix(data, [0x49, 0x44, 0x33])) return null;
    var verMajor = data[3];
    var flags = data[5];
    var size = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f);
    var pos = 10;
    var end = Math.min(10 + size, data.length);
    if (flags & 0x40) { // extended header
      if (verMajor === 4) {
        var extSize = ((data[pos] & 0x7f) << 21) | ((data[pos + 1] & 0x7f) << 14) | ((data[pos + 2] & 0x7f) << 7) | (data[pos + 3] & 0x7f);
        pos += extSize;
      } else if (verMajor === 3) {
        pos += 4 + ((data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]);
      }
    }
    var result = { frames: [] };
    var frameHeaderSize = verMajor === 2 ? 6 : 10;
    while (pos + frameHeaderSize <= end) {
      var id, fsize, frameFlags = 0;
      if (verMajor === 2) {
        id = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2]);
        fsize = (data[pos + 3] << 16) | (data[pos + 4] << 8) | data[pos + 5];
      } else {
        id = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
        if (data[pos] === 0) break; // padding
        if (verMajor === 4) {
          fsize = ((data[pos + 4] & 0x7f) << 21) | ((data[pos + 5] & 0x7f) << 14) | ((data[pos + 6] & 0x7f) << 7) | (data[pos + 7] & 0x7f);
        } else {
          fsize = (data[pos + 4] << 24) | (data[pos + 5] << 16) | (data[pos + 6] << 8) | data[pos + 7];
        }
        frameFlags = (data[pos + 8] << 8) | data[pos + 9];
      }
      if (fsize <= 0 || pos + frameHeaderSize + fsize > end) break;
      var frameData = data.subarray(pos + frameHeaderSize, pos + frameHeaderSize + fsize);
      // 跳过含压缩/加密的帧
      if (verMajor === 4 && (frameFlags & 0x0008)) { pos += frameHeaderSize + fsize; continue; }
      if (verMajor === 3 && (frameFlags & 0x00c0)) { pos += frameHeaderSize + fsize; continue; }
      result.frames.push({ id: id, data: frameData });
      pos += frameHeaderSize + fsize;
    }
    // 解析常用帧
    for (var i = 0; i < result.frames.length; i++) {
      var f = result.frames[i];
      if (f.id === 'TIT2' || f.id === 'TT2') result.title = parseTextFrame(f.data);
      else if (f.id === 'TPE1' || f.id === 'TP1') result.artist = parseTextFrame(f.data);
      else if (f.id === 'TALB' || f.id === 'TAL') result.album = parseTextFrame(f.data);
      else if (f.id === 'TPE2' || f.id === 'TP2') result.albumartist = parseTextFrame(f.data);
      else if (f.id === 'APIC' || f.id === 'PIC') {
        var pic = parseAPIC(f.data, f.id === 'PIC');
        if (pic) result.picture = pic;
      }
    }
    return result;
  }

  function parseTextFrame(data) {
    if (data.length < 1) return '';
    var enc = data[0];
    var text = decodeText(data.subarray(1), enc);
    // 多值以 \0 分隔
    return text.replace(/\0+$/g, '').replace(/\0/g, '; ');
  }

  function parseAPIC(data, isV22) {
    try {
      var enc = data[0];
      var pos = 1, mime;
      if (isV22) {
        mime = String.fromCharCode(data[1], data[2], data[3]);
        pos = 4;
      } else {
        var mimeEnd = pos;
        while (mimeEnd < data.length && data[mimeEnd] !== 0) mimeEnd++;
        mime = utils.utf8Decode(data.subarray(pos, mimeEnd));
        pos = mimeEnd + 1;
      }
      pos += 1; // picture type
      // description (按编码以 \0 结尾)
      if (enc === 1 || enc === 2) {
        while (pos + 1 < data.length && !(data[pos] === 0 && data[pos + 1] === 0)) pos += 2;
        pos += 2;
      } else {
        while (pos < data.length && data[pos] !== 0) pos++;
        pos += 1;
      }
      if (pos >= data.length) return null;
      return { mime: mime || 'image/jpeg', data: data.slice(pos) };
    } catch (e) { return null; }
  }

  // ---------- FLAC ----------
  function parseFLAC(data) {
    if (!utils.bytesHasPrefix(data, [0x66, 0x4c, 0x61, 0x43])) return null;
    var pos = 4;
    var result = {};
    var guard = 0;
    while (pos + 4 <= data.length && guard++ < 100) {
      var header = data[pos];
      var isLast = (header & 0x80) !== 0;
      var type = header & 0x7f;
      var size = (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
      var body = data.subarray(pos + 4, pos + 4 + size);
      if (type === 4) parseVorbisComment(body, result);
      else if (type === 6) parseFLACPicture(body, result);
      pos += 4 + size;
      if (isLast) break;
    }
    return result;
  }

  function parseVorbisComment(body, result) {
    var dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    var pos = 0;
    var vendorLen = dv.getUint32(pos, true); pos += 4 + vendorLen;
    if (pos + 4 > body.length) return;
    var count = dv.getUint32(pos, true); pos += 4;
    for (var i = 0; i < count && pos + 4 <= body.length; i++) {
      var len = dv.getUint32(pos, true); pos += 4;
      if (pos + len > body.length) break;
      var comment = utils.utf8Decode(body.subarray(pos, pos + len));
      pos += len;
      var eq = comment.indexOf('=');
      if (eq < 0) continue;
      var key = comment.slice(0, eq).toUpperCase();
      var value = comment.slice(eq + 1);
      if (key === 'TITLE') result.title = value;
      else if (key === 'ARTIST') result.artist = (result.artist ? result.artist + '; ' : '') + value;
      else if (key === 'ALBUM') result.album = value;
      else if (key === 'ALBUMARTIST') result.albumartist = value;
      else if (key === 'METADATA_BLOCK_PICTURE') {
        try {
          var bin = atob(value);
          var bytes = new Uint8Array(bin.length);
          for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          parseFLACPicture(bytes, result);
        } catch (e) { /* ignore */ }
      }
    }
  }

  function parseFLACPicture(body, result) {
    try {
      var dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
      var pos = 4; // type
      var mimeLen = dv.getUint32(pos); pos += 4;
      var mime = utils.utf8Decode(body.subarray(pos, pos + mimeLen)); pos += mimeLen;
      var descLen = dv.getUint32(pos); pos += 4 + descLen;
      pos += 16; // width/height/depth/colors
      var dataLen = dv.getUint32(pos); pos += 4;
      if (pos + dataLen > body.length) return;
      result.picture = { mime: mime, data: body.slice(pos, pos + dataLen) };
    } catch (e) { /* ignore */ }
  }

  // ---------- OGG ----------
  function parseOGG(data) {
    if (!utils.bytesHasPrefix(data, [0x4f, 0x67, 0x67, 0x53])) return null;
    var result = {};
    // 在前 256KB 内寻找 comment 头
    var search = Math.min(data.length, 256 * 1024);
    for (var magic of ['\x03vorbis', 'OpusTags']) {
      var bytes = [];
      for (var c = 0; c < magic.length; c++) bytes.push(magic.charCodeAt(c));
      for (var pos = 0; pos + 8 < search; pos++) {
        var matched = true;
        for (var k = 0; k < bytes.length; k++) {
          if (data[pos + k] !== bytes[k]) { matched = false; break; }
        }
        if (matched) {
          try { parseVorbisComment(data.subarray(pos + bytes.length), result); } catch (e) { /* ignore */ }
          return result;
        }
      }
    }
    return result;
  }

  // ---------- M4A / MP4 ----------
  function parseM4A(data) {
    if (data.length < 12 || !utils.bytesHasPrefix(data.subarray(4, 8), [0x66, 0x74, 0x79, 0x70])) return null;
    var result = {};
    findIlst(data, 0, data.length, result, 0);
    return result;
  }

  function findIlst(data, start, end, result, depth) {
    if (depth > 8) return;
    var pos = start;
    while (pos + 8 <= end) {
      var size = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
      if (size < 8 || pos + size > end) return;
      var type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
      if (type === 'moov' || type === 'udta') {
        findIlst(data, pos + 8, pos + size, result, depth + 1);
      } else if (type === 'meta') {
        findIlst(data, pos + 12, pos + size, result, depth + 1); // 跳过 4 字节 version/flags
      } else if (type === 'ilst') {
        parseIlst(data, pos + 8, pos + size, result);
        return;
      }
      pos += size;
    }
  }

  function parseIlst(data, start, end, result) {
    var pos = start;
    var map = {
      '\u00a9nam': 'title', '\u00a9ART': 'artist', '\u00a9alb': 'album',
      'aART': 'albumartist', 'covr': 'picture',
    };
    while (pos + 8 <= end) {
      var size = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
      if (size < 8 || pos + size > end) break;
      var atom = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
      var key = map[atom];
      if (key) {
        // 在 item 内找 data atom
        var p = pos + 8;
        while (p + 16 <= pos + size) {
          var dsize = (data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3];
          if (dsize < 16 || p + dsize > pos + size) break;
          if (String.fromCharCode(data[p + 4], data[p + 5], data[p + 6], data[p + 7]) === 'data') {
            var dataType = (data[p + 8] << 24) | (data[p + 9] << 16) | (data[p + 10] << 8) | data[p + 11];
            var payload = data.subarray(p + 16, p + dsize);
            if (key === 'picture') {
              var mime = dataType === 14 ? 'image/png' : 'image/jpeg';
              result.picture = { mime: mime, data: payload.slice() };
            } else if (dataType === 1) { // UTF-8 text
              result[key] = utils.utf8Decode(payload);
            }
            break;
          }
          p += dsize;
        }
      }
      pos += size;
    }
  }

  /**
   * 解析音频元数据
   * @returns {{title, artist, album, picture: {mime, data}|null}}
   */
  function parseMetadata(data, ext) {
    var parsed = null;
    try {
      if (ext === 'mp3') parsed = parseID3v2(data);
      else if (ext === 'flac') parsed = parseFLAC(data);
      else if (ext === 'ogg' || ext === 'opus' || ext === 'ogv') parsed = parseOGG(data);
      else if (ext === 'm4a' || ext === 'mp4' || ext === 'mmp4') parsed = parseM4A(data);
    } catch (e) {
      console.warn('parse metadata failed', e);
    }
    if (!parsed) parsed = {};
    return {
      title: parsed.title || '',
      artist: parsed.artist || '',
      album: parsed.album || '',
      albumartist: parsed.albumartist || '',
      picture: parsed.picture || null,
      _parsed: parsed,
    };
  }

  UM.metadata = {
    parseMetadata: parseMetadata,
    parseID3v2: parseID3v2,
    parseFLAC: parseFLAC,
    parseOGG: parseOGG,
    parseM4A: parseM4A,
  };
  if (typeof module === 'object' && module.exports) module.exports = UM.metadata;
})();
