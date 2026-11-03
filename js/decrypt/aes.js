/**
 * 纯 JS 实现的 AES-128 ECB 解密（用于 NCM 文件解密）
 * 标准高级加密标准 (FIPS-197) 逆密码实现
 */
(function () {
  var UM = (typeof self !== 'undefined' ? self : globalThis).UM || ((typeof self !== 'undefined' ? self : globalThis).UM = {});

  var SBOX = new Uint8Array(256);
  var INV_SBOX = new Uint8Array(256);
  (function init() {
    // 不可约多项式 x^8+x^4+x^3+x+1 = 0x11B 上的乘法逆元 + 仿射变换
    var p = 1, q = 1;
    SBOX[0] = 0x63;
    do {
      // multiply p by 3
      p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
      // divide q by 3
      q ^= (q << 1) & 0xff;
      q ^= (q << 2) & 0xff;
      q ^= (q << 4) & 0xff;
      if (q & 0x80) q ^= 0x09;
      var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
      SBOX[p] = (x ^ 0x63) & 0xff;
    } while (p !== 1);
    for (var i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;
  })();

  function xtime(a) { return ((a << 1) ^ (a & 0x80 ? 0x1b : 0x00)) & 0xff; }
  function mul(a, b) {
    var r = 0;
    while (b) {
      if (b & 1) r ^= a;
      a = xtime(a);
      b >>= 1;
    }
    return r & 0xff;
  }

  // AES-128 轮密钥扩展
  function expandKey(key) {
    var w = new Uint8Array(176);
    w.set(key);
    var rcon = 1;
    for (var i = 16; i < 176; i += 4) {
      var t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
      if (i % 16 === 0) {
        var tmp = t0;
        t0 = SBOX[t1] ^ rcon; t1 = SBOX[t2]; t2 = SBOX[t3]; t3 = SBOX[tmp];
        rcon = xtime(rcon);
      }
      w[i] = w[i - 16] ^ t0;
      w[i + 1] = w[i - 15] ^ t1;
      w[i + 2] = w[i - 14] ^ t2;
      w[i + 3] = w[i - 13] ^ t3;
    }
    return w;
  }

  // 解密单个 16 字节块 (in place, input/output 为 16 长度 Uint8Array)
  var T0 = new Uint8Array(256), T1 = new Uint8Array(256), T2 = new Uint8Array(256), T3 = new Uint8Array(256);
  for (var bi = 0; bi < 256; bi++) {
    var g = mul(bi, 14), h = mul(bi, 11), k = mul(bi, 13), l = mul(bi, 9);
    T0[bi] = g; T1[bi] = h; T2[bi] = k; T3[bi] = l;
  }

  // 逆行移位：第 r 行向右循环移动 r（flat 布局: index = col*4 + row）
  function invShiftRows(s) {
    var t = new Uint8Array(16);
    t.set(s);
    for (var row = 0; row < 4; row++) {
      for (var c = 0; c < 4; c++) {
        s[((c + row) % 4) * 4 + row] = t[c * 4 + row];
      }
    }
  }

  function decryptBlock(w, block, off) {
    var s = new Uint8Array(16);
    var i, r;
    // AddRoundKey(10)
    for (i = 0; i < 16; i++) s[i] = block[off + i] ^ w[160 + i];
    for (r = 9; r >= 1; r--) {
      // InvShiftRows
      invShiftRows(s);
      // InvSubBytes
      for (i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
      // AddRoundKey
      for (i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
      // InvMixColumns
      for (var col = 0; col < 4; col++) {
        var a0 = s[col * 4], a1 = s[col * 4 + 1], a2 = s[col * 4 + 2], a3 = s[col * 4 + 3];
        s[col * 4] = T0[a0] ^ T1[a1] ^ T2[a2] ^ T3[a3];
        s[col * 4 + 1] = T3[a0] ^ T0[a1] ^ T1[a2] ^ T2[a3];
        s[col * 4 + 2] = T2[a0] ^ T3[a1] ^ T0[a2] ^ T1[a3];
        s[col * 4 + 3] = T1[a0] ^ T2[a1] ^ T3[a2] ^ T0[a3];
      }
    }
    // 最后一轮: InvShiftRows + InvSubBytes + AddRoundKey(0)
    invShiftRows(s);
    for (i = 0; i < 16; i++) block[off + i] = INV_SBOX[s[i]] ^ w[i];
  }

  /**
   * AES-128-ECB 解密（含 PKCS7 去填充）
   * @param {Uint8Array} data 密文（长度为 16 的倍数）
   * @param {Uint8Array} key 16 字节密钥
   * @returns {Uint8Array} 明文
   */
  function decryptECB(data, key) {
    if (key.length !== 16) throw new Error('AES-128 密钥长度必须为 16 字节');
    if (data.length % 16 !== 0) throw new Error('密文长度必须是 16 的倍数');
    var w = expandKey(key);
    var out = data.slice();
    for (var off = 0; off < out.length; off += 16) decryptBlock(w, out, off);
    // PKCS7 unpad
    if (out.length > 0) {
      var pad = out[out.length - 1];
      if (pad >= 1 && pad <= 16) {
        var ok = true;
        for (var i = out.length - pad; i < out.length; i++) if (out[i] !== pad) { ok = false; break; }
        if (ok) out = out.slice(0, out.length - pad);
      }
    }
    return out;
  }

  UM.aes = { decryptECB: decryptECB, expandKey: expandKey };
  if (typeof module === 'object' && module.exports) module.exports = UM.aes;
})();
