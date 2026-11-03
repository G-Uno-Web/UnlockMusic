/**
 * 简易 ID3v2.3 写入器：为 MP3 写入 标题/歌手/专辑/封面
 * 会保留原有 ID3 标签中的其他帧
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});
  var utils = UM.utils;

  function utf8Bytes(str) {
    return new TextEncoder().encode(str);
  }

  function makeTextFrame(id, text) {
    var payload = new Uint8Array(1 + (text ? utf8Bytes(text).length : 0));
    payload[0] = 3; // UTF-8 编码
    if (text) payload.set(utf8Bytes(text), 1);
    return makeFrame(id, payload);
  }

  function makeFrame(id, payload) {
    var frame = new Uint8Array(10 + payload.length);
    for (var i = 0; i < 4; i++) frame[i] = id.charCodeAt(i);
    frame[4] = (payload.length >>> 24) & 0xff;
    frame[5] = (payload.length >>> 16) & 0xff;
    frame[6] = (payload.length >>> 8) & 0xff;
    frame[7] = payload.length & 0xff;
    frame.set(payload, 10);
    return frame;
  }

  function makePictureFrame(picture) {
    var mime = utf8Bytes(picture.mime || 'image/jpeg');
    var desc = new Uint8Array(1); // 空描述 (latin1 终止符)
    var payload = new Uint8Array(1 + mime.length + 1 + 1 + desc.length + picture.data.length);
    var pos = 0;
    payload[pos++] = 0; // latin1
    payload.set(mime, pos); pos += mime.length;
    payload[pos++] = 0; // mime 终止
    payload[pos++] = 3; // 封面类型: front cover
    payload.set(desc, pos); pos += desc.length;
    payload.set(picture.data, pos);
    return makeFrame('APIC', payload);
  }

  /**
   * 将元数据写入 MP3（ID3v2.3）
   * @param {Uint8Array} audioData 原始音频（可能带旧 ID3 头）
   * @param {{title, artist, album, artists?: string[], picture: {mime,data}|null}} info
   */
  function writeMetaToMp3(audioData, info) {
    // 去掉旧 ID3v2 头
    var body = audioData;
    if (utils.bytesHasPrefix(audioData, [0x49, 0x44, 0x33])) {
      var size = ((audioData[6] & 0x7f) << 21) | ((audioData[7] & 0x7f) << 14) | ((audioData[8] & 0x7f) << 7) | (audioData[9] & 0x7f);
      body = audioData.subarray(10 + size);
    }

    var frames = [];
    var artist = info.artists && info.artists.length ? info.artists.join('\u0000') : (info.artist || '');
    frames.push(makeTextFrame('TIT2', info.title || ''));
    frames.push(makeTextFrame('TPE1', artist));
    frames.push(makeTextFrame('TALB', info.album || ''));
    if (info.picture) frames.push(makePictureFrame(info.picture));

    // 保留原有的其他帧（如音轨号等）
    try {
      var parsed = UM.metadata.parseID3v2(audioData);
      if (parsed && parsed.frames) {
        parsed.frames.forEach(function (f) {
          if (['TIT2', 'TPE1', 'TALB', 'APIC'].indexOf(f.id) === -1) {
            frames.push(makeFrame(f.id, f.data));
          }
        });
      }
    } catch (e) { /* ignore */ }

    var total = 0;
    frames.forEach(function (f) { total += f.length; });
    var padding = 1024;
    var tag = new Uint8Array(10 + total + padding);
    tag[0] = 0x49; tag[1] = 0x44; tag[2] = 0x33; // "ID3"
    tag[3] = 3; tag[4] = 0; // v2.3, revision 0
    tag[5] = 0; // flags
    var tagSize = total + padding;
    tag[6] = (tagSize >>> 21) & 0x7f;
    tag[7] = (tagSize >>> 14) & 0x7f;
    tag[8] = (tagSize >>> 7) & 0x7f;
    tag[9] = tagSize & 0x7f;
    var off = 10;
    frames.forEach(function (f) { tag.set(f, off); off += f.length; });

    return utils.concatBytes([tag, body]);
  }

  UM.id3writer = { writeMetaToMp3: writeMetaToMp3 };
  if (typeof module === 'object' && module.exports) module.exports = UM.id3writer;
})();
