# 原生接入与可复现检查

## 生产入口

[pack/figure.json](../pack/figure.json) 是唯一生产清单：Coopanion manifest 2 / API 2，导出 factory 为 `createMaodouBody`，角色 ID 为 `maodou-shiny`。清单注册 25 个表情、28 个动作。词定义位于 [runtime/words.js](../runtime/words.js)，真实运行验收另见 [验收入口](qa/acceptance.md)。

原生 frame 调用 `factory(base, { model, scheme, kit, loadImage, asset, host })`。角色通过 `opts.loadImage(opts.asset(model.art.atlas.file))` 载入已有图集，直接读取传入的 `model`；隔离 frame 不从网络请求美术或模型数据。源入口 [pack/figure.js](../pack/figure.js) 将原生 kit 交给适配器，再构造绘画 figure 与原生 body。

固定上游是 [Pal-AI-Lab/Coopanion 04ce022a](https://github.com/Pal-AI-Lab/Coopanion/tree/04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33/packages/cortico-world-desktop-pet/web)，复制源码和哈希见 [provenance.json](../preview-host/vendor/coopanion/provenance.json)。`host-fix/` 的旧宿主修复是另一份明确基线上的补丁，不能误认为固定 vendor 已被替换。

## 转向、步态与生命周期

适配器保留原生移动、重力、拖拽和事件模拟，只在绘制时抑制整组负 X 镜像，把朝向映射为连续 `viewYaw`。角色用各方向的绘画、几何及近耳遮挡实现约 ±75° 转向。`legsScreen`、原生状态及运动相位驱动短脚与手爪；figure 不自行重建另一套世界移动系统。

只有一个宿主时钟推进姿态和绘制。整耳的 `raise / spread` 与局部耳弯、耳尖弹簧分开，耳根保持连接；表情切换按时间平滑。说话字段是宿主脉冲，不能据此声称采集或分析了声音。

指针释放修复分两层：角色适配器处理收到的 `buttons=0` / `cancel`，旧宿主补丁负责真正发送这些状态并收取窗口级释放、失去 capture、失焦和隐藏事件。旧宿主漏报时，仅更新 ZIP 无法完整补齐上游缺失的数据。应用方法和明确边界见 [host-fix/README.md](../host-fix/README.md)。

## 本地预览与安装 ZIP

先按 [README](../README.md) 安装 Node、Python 依赖，再运行：

```sh
npm run stage
npm run preview
```

预览服务提供原生 opaque iframe 及本地资源限制。`stage-pack.mjs` 把 `pack/figure.js` 和项目模块打包成独立入口，并核对源文件。源码变化后要重新 staging，不能复用旧副本。

```sh
node preview-host/validate-native.mjs --build-zip=exports/Maodou-Coopanion-v1.3.1.zip --report=docs/qa/native-import.json
node tools/build-standalone.mjs
```

原生校验器调用固定上游的 manifest、ZIP 与 `PackImporter.stage/install`，并检查图片解码、CRC 和文件字节。独立 HTML 内嵌相同角色与固定身体代码，但不具有原生 iframe 的隔离边界，两种入口各自验证。

## CPU 检查

```sh
node runtime/host-adapter.contract.mjs
node host-fix/pointer-lifecycle.contract.mjs
node preview-host/words-contract.mjs
node tools/check-animation.mjs
```

检查脚本会保存或打印实际结果。数值有限、权重归一或合成 pointer 事件通过，并不证明画面无接缝、操作系统捕获正确或真实帧率足够。

## 可选：浏览器检查与运行图采样

浏览器检查不是日常预览或构建 ZIP 的前置要求。若要复现它们，另安装 Playwright：

```sh
npm --prefix preview-host install --no-save --package-lock=false playwright
```

使用已有 Chromium/Chrome 的实际可执行路径，例如 `/path/to/chrome`。下面的参数只是占位，需要替换为本机路径；这些工具会启动自己的测试浏览器。

先停止手动启动的本地预览服务器；`run-preview-qa.mjs` 会独占端口 4323，运行结束后自行关闭服务器。`qa-release.mjs` 使用自己的临时端口。

```sh
node tools/run-preview-qa.mjs --chromium=/path/to/chrome --phase=angles --out=docs/qa/angles-local
node tools/run-preview-qa.mjs --chromium=/path/to/chrome --phase=words --out=docs/qa/v1.3.1/words
node tools/qa-release.mjs --chromium=/path/to/chrome --out=docs/qa/v1.3.1/release --offline=exports/Maodou-Offline-Preview-v1.3.1.html
```

`--software-webgl` 会选择软件 WebGL，仅在需要该测试条件时使用。软件 GPU 的 FPS 不应写成硬件桌面结果。报告保留状态、错误、GPU、尺寸、源码始末哈希和截图来源，逐项解释范围。

完整字体及两组实际截图报告存在后，可以制作技术排版的 PNG 图册：

```sh
python tools/fetch-preview-font.py
python tools/build-release-contact.py
```

图册脚本读取 `docs/qa/v1.3.1/words` 与 `docs/qa/v1.3.1/release` 的真实透明 PNG，验证来源后裁切、缩放、排版，不补画姿态。本仓库大报告压缩存放，使用已带采样重建图册前先分别执行 `gzip -dk <目录>/report.json.gz`。如重新采样，报告会记录新的实际源码和截图哈希；没有实际输入时，应先完成相应采样。

最终走跑与停步、指针专项可独立复现：

```sh
node tools/qa-motion-v131.mjs --chromium=/path/to/chrome --scheme=both --only=walk-left,walk-right,run-left,run-right --out=docs/qa/gait-local
node tools/qa-pointer-v131.mjs --chromium=/path/to/chrome --out=docs/qa/pointer-local
```
