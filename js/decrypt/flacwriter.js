/**
 * FLAC 元数据写入器：插入/更新 VORBIS_COMMENT 与 PICTURE 块
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  function utf8Bytes(str) { return new TextEncoder().encode(str); }

  function u32be(n) { return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]); }
  function u24be(n) { return new Uint8Array([(n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]); }
  function u32le(n) { return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]); }

  // {type(7bit)|last(1bit), size(24bit), body}
  function makeBlock(type, body, isLast) {
    var header = new Uint8Array(4);
    header[0] = (isLast ? 0x80 : 0) | type;
    header[1] = (body.length >>> 16) & 0xff;
    header[2] = (body.length >>> 8) & 0xff;
    header[3] = body.length & 0xff;
    return utils.concatBytes([header, body]);
  }

  function makeVorbisComment(comments) {
    var vendor = utf8Bytes('unlock-music-web');
    var parts = [u32le(vendor.length), vendor, u32le(comments.length)];
    comments.forEach(function (c) {
      var b = utf8Bytes(c);
      parts.push(u32le(b.length), b);
    });
    return utils.concatBytes(parts);
  }

  function makePictureBlock(picture) {
    // type(4) + mime_len + mime + desc_len + desc + w/h/depth/colors(16) + data_len + data
    var mime = utf8Bytes(picture.mime || 'image/jpeg');
    var desc = new Uint8Array(0);
    var parts = [
      u32be(3), // front cover
      u32be(mime.length), mime,
      u32be(desc.length), desc,
      u32be(0), u32be(0), u32be(24), u32be(0), // width height depth colors（未知填 0）
      u32be(picture.data.length), picture.data,
    ];
    return utils.concatBytes(parts);
  }

  /**
   * 将元数据写入 FLAC
   * @param {Uint8Array} audioData 原始 FLAC 数据
   * @param {{title, artist, album, artists?: string[], picture: {mime,data}|null}} info
   */
  function writeMetaToFlac(audioData, info) {
    if (!utils.bytesHasPrefix(audioData, [0x66, 0x4c, 0x61, 0x43])) throw new Error('not a flac file');
    var blocks = [];
    var pos = 4;
    var hasComment = false, hasPicture = false;
    while (pos + 4 <= audioData.length) {
      var header = audioData[pos];
      var isLast = (header & 0x80) !== 0;
      var type = header & 0x7f;
      var size = (audioData[pos + 1] << 16) | (audioData[pos + 2] << 8) | audioData[pos + 3];
      var body = audioData.slice(pos + 4, pos + 4 + size);
      if (type === 0) {
        blocks.push({ type: 0, body: body }); // STREAMINFO 必须保留
      } else if (type === 4) {
        hasComment = true; // 替换
      } else if (type === 6) {
        hasPicture = true; // 替换
      } else {
        blocks.push({ type: type, body: body });
      }
      pos += 4 + size;
      if (isLast) break;
    }
    if (pos > audioData.length) pos = audioData.length;

    var comments = ['TITLE=' + (info.title || '')];
    var artists = info.artists && info.artists.length ? info.artists : (info.artist ? [info.artist] : []);
    artists.forEach(function (a) { comments.push('ARTIST=' + a); });
    if (info.album) comments.push('ALBUM=' + info.album);

    var newBlocks = [makeBlock(0, blocks[0].body, false)];
    if (hasComment || comments.length) newBlocks.push(makeBlock(4, makeVorbisComment(comments), false));
    if (info.picture) newBlocks.push(makeBlock(6, makePictureBlock(info.picture), false));
    blocks.slice(1).forEach(function (b) { newBlocks.push(makeBlock(b.type, b.body, false)); });
    // 修正 last 标志
    var last = newBlocks[newBlocks.length - 1];
    last[0] |= 0x80;

    return utils.concatBytes([new Uint8Array([0x66, 0x4c, 0x61, 0x43])].concat(newBlocks).concat([audioData.subarray(pos)]));
  }

  UM.flacwriter = { writeMetaToFlac: writeMetaToFlac };
  if (typeof module === 'object' && module.exports) module.exports = UM.flacwriter;
})();
