# 音乐解锁 (Music Unlock)

一个纯前端的加密音乐解锁工具，功能对标 [Unlock Music](https://demo.unlock-music.dev/)。
在浏览器中本地解锁加密的音乐文件 —— **文件不会上传到任何服务器**。

## 功能特性

- 🔒 **100% 本地处理**：解密全部在浏览器 Web Worker 中完成，断网也能用
- 🎵 **格式覆盖广**：QQ音乐（含新版 mflac/mgg）、网易云、酷狗、酷我、虾米、咪咕、喜马拉雅等 40+ 种扩展名
- ⚡ **WASM 加速**：QMC/KGM 使用与官方版本相同的 WebAssembly 模块解密
- 🖼️ **元数据完整**：解密后解析标题/歌手/专辑/封面，并为无标签文件回写 ID3 / FLAC 标签
- 📦 **批量处理**：多文件并行解密，支持一键 ZIP 打包下载
- 💾 **立即保存**：支持 File System Access API，解锁完成自动写入指定文件夹（Chrome/Edge）
- ▶️ **在线试听**：解密完成后可直接播放
- 🚀 **零依赖部署**：纯静态文件，无需构建，任意静态服务器均可托管

## 支持的格式

| 平台 | 扩展名 |
| --- | --- |
| QQ音乐 | `.qmc0 .qmc2 .qmc3 .qmc4 .qmc6 .qmc8 .qmcflac .qmcogg .tkm .cache .tm0 .tm2 .tm3 .tm6` |
| QQ音乐(新版) | `.mflac .mflac0 .mgg .mgg0 .mgg1 .mggl .mmp4` |
| Moo 音乐 | `.bkcmp3 .bkcm4a .bkcflac .bkcwav .bkcape .bkcogg .bkcwma` |
| 网易云音乐 | `.ncm`（含缓存 `.uc`） |
| 酷狗音乐 | `.kgm .kgma .vpr` |
| 酷我音乐 | `.kwm` |
| 虾米音乐 | `.xm` |
| 咪咕音乐 | `.mg3d` |
| 喜马拉雅 | `.x2m .x3m` |
| 微云导出 | `.666c6163 .6d7033 .6f6767 .6d3461 .776176`（十六进制后缀） |
| 原始格式 | `.mp3 .flac .wav .m4a .ogg`（直通并补全标签） |

> `.mflach` 等最新格式请使用[官方 CLI 版本](https://git.um-react.app/um/cli)。
> JOOX（`.ofl_en`）需要应用 UUID 密钥，本站未实现。

## 使用方法

```bash
# 任选一种方式启动静态服务器
cd site
python -m http.server 8000
# 或
npx serve .
```

打开 `http://localhost:8000`，拖入加密音乐文件即可。

> 提示：通过 HTTP(S) 访问体验最佳；直接双击 index.html（file:// 协议）时部分浏览器可能限制 Worker。

## 测试

```bash
node test/run-tests.mjs
```

测试覆盖：AES-128-ECB（与 Node crypto 对比）、NCM/KWM/XM/TM/咪咕/喜马拉雅/网易云缓存 构造→解密 roundtrip、ID3/FLAC 标签读写、ZIP 打包、QMC WASM（官方测试向量，需先下载至 `test/vectors/`）。

## 目录结构

```
site/
  index.html              # 主页面
  css/style.css           # 样式
  js/main.js              # UI 逻辑（Worker 池、表格、下载）
  js/worker.js            # 解密 Worker
  js/zip.js               # store-only ZIP 打包器
  js/decrypt/
    index.js              # 格式分发器
    utils.js              # 嗅探/工具
    aes.js                # 纯 JS AES-128-ECB
    ncm.js kwm.js xm.js   # 各格式解密
    kgm.js qmc.js         # WASM 封装
    misc.js tm.js raw.js ximalaya.js
    metadata.js           # 元数据解析 (ID3v2/FLAC/OGG/M4A)
    id3writer.js flacwriter.js  # 标签回写
  js/lib/wasm/            # QMC/KGM WASM 模块（Apache-2.0）
test/
  run-tests.mjs           # Node 测试套件
  vectors/                # 官方 QMC 测试向量（下载脚本）
```

## 致谢与许可

- 解密算法参考 [unlock-music/web](https://git.um-react.app/um/web)（MIT License）
- WASM 模块来自 npm 包 `@xhacker/qmcwasm`、`@xhacker/kgmwasm`（Apache-2.0 License）

## 免责声明

本项目仅供学习与技术研究，以及解锁您已合法获取的音乐文件的个人备份。
请尊重音乐版权，勿将解密后的文件用于传播或商业用途。
