# 原生接入与可复现检查

## 生产入口

[pack/figure.json](../pack/figure.json) 是唯一生产清单：Coopanion manifest 2 / API 2，导出 factory 为 `createMaodouBody`，角色 ID 为 `maodou-shiny`。清单注册 25 个表情、28 个动作。词定义位于 [runtime/words.js](../runtime/words.js)，真实运行验收另见 [验收入口](qa/acceptance.md)。

原生 frame 调用 `factory(base, { model, scheme, kit, loadImage, asset, host })`。角色通过 `opts.loadImage(opts.asset(model.art.atlas.file))` 载入已有图集，直接读取传入的 `model`；隔离 frame 不从网络请求美术或模型数据。源入口 [pack/figure.js](../pack/figure.js) 将原生 kit 交给适配器，再构造绘画 figure 与原生 body。

固定上游是 [Pal-AI-Lab/Coopanion 04ce022a](https://github.com/Pal-AI-Lab/Coopanion/tree/04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33/packages/cortico-world-desktop-pet/web)，复制源码和哈希见 [provenance.json](../preview-host/vendor/coopanion/provenance.json)。`host-fix/` 的旧宿主修复是另一份明确基线上的补丁，不能误认为固定 vendor 已被替换。

## 转向、步态与生命周期

适配器保留原生移动、重力、拖拽和事件模拟，只在绘制时抑制整组负 X 镜像，把朝向映射为连续 `viewYaw`。角色用各方向的绘画、几何及近耳遮挡实现约 ±75° 转向。`legsScreen`、原生状态及运动相位驱动短脚与手爪；figure 不自行重建另一套世界移动系统。

只有一个宿主时钟推进姿态和绘制。整耳的 `raise / spread` 与局部耳弯、耳尖弹簧分开，耳根保持连接；表情切换按时间平滑。说话字段是宿主脉冲，不能据此声称采集或分析了声音。

v1.3.2 的耳根颜色投影到当前头部材质，中间转向的耳肩与头部隐藏分支共用一条外缘过渡。走跑采用宿主相位驱动的支撑与摆动轨迹，近侧四肢在躯干前的覆盖随视向变化；支撑检查针对角色模型空间，不表示世界坐标锁足。实现说明见 [v1.3.2 版本记录](releases/v1.3.2.md)。

指针释放修复分两层：角色适配器处理收到的 `buttons=0` / `cancel`，旧宿主补丁负责真正发送这些状态并收取窗口级释放、失去 capture、失焦和隐藏事件。旧宿主漏报时，仅更新 ZIP 无法完整补齐上游缺失的数据。应用方法和明确边界见 [host-fix/README.md](../host-fix/README.md)。

## 本地预览与安装 ZIP

先按 [README](../README.md) 安装 Node、Python 依赖，再运行：

```sh
npm run stage
npm run preview
```

预览服务提供原生 opaque iframe 及本地资源限制。`stage-pack.mjs` 把 `pack/figure.js` 和项目模块打包成独立入口，并核对源文件。源码变化后要重新 staging，不能复用旧副本。

```sh
node preview-host/validate-native.mjs --build-zip=exports/Maodou-Coopanion-v1.3.2.zip --report=docs/qa/v1.3.2/local/native-import.json
node tools/build-standalone.mjs --out=exports/Maodou-Offline-Preview-v1.3.2.html --report=docs/qa/v1.3.2/local/standalone-build.json
```

原生校验器调用固定上游的 manifest、ZIP 与 `PackImporter.stage/install`，并检查图片解码、CRC 和文件字节。独立 HTML 内嵌相同角色与固定身体代码，但不具有原生 iframe 的隔离边界，两种入口各自验证。

## CPU 检查

```sh
node runtime/host-adapter.contract.mjs
node host-fix/pointer-lifecycle.contract.mjs
node preview-host/words-contract.mjs
node tools/check-animation.mjs
node tools/check-root-material.mjs
```

检查脚本会保存或打印实际结果。数值有限、权重归一或合成 pointer 事件通过，并不证明画面无接缝、操作系统捕获正确或真实帧率足够。

## 可选：浏览器检查与运行图采样

浏览器检查不是日常预览或构建 ZIP 的前置要求。若要复现它们，另安装 Playwright：

```sh
npm --prefix preview-host install --no-save --package-lock=false playwright
```

使用已有 Chromium/Chrome 的实际可执行路径，例如 `/path/to/chrome`。下面的参数只是占位，需要替换为本机路径；这些工具会启动自己的测试浏览器。

先停止手动启动的本地预览服务器；`run-preview-qa.mjs` 会独占端口 4323，运行结束后自行关闭服务器。`qa-release.mjs` 使用自己的临时端口。下列命令把新记录写入 `docs/qa/v1.3.2/local/`，与已分发的发布证据和 v1.3.1 历史记录分开；重复本地检查时，可再选择新的输出子目录。

```sh
node tools/run-preview-qa.mjs --chromium=/path/to/chrome --phase=angles --out=docs/qa/v1.3.2/local/angles
node tools/run-preview-qa.mjs --chromium=/path/to/chrome --phase=words --out=docs/qa/v1.3.2/local/words
node tools/qa-release.mjs --chromium=/path/to/chrome --out=docs/qa/v1.3.2/local/release --offline=exports/Maodou-Offline-Preview-v1.3.2.html
```

`--software-webgl` 会选择软件 WebGL，仅在需要该测试条件时使用。软件 GPU 的 FPS 不应写成硬件桌面结果。报告保留状态、错误、GPU、尺寸、源码始末哈希和截图来源，逐项解释范围。

走跑与停步、指针专项可独立采样。下列工具沿用已有文件名，实际检查的是当前 staged 角色；输出目录明确使用 v1.3.2。

```sh
node tools/qa-motion-v131.mjs --chromium=/path/to/chrome --scheme=both --only=walk-left,walk-right,run-left,run-right --out=docs/qa/v1.3.2/local/motion
node tools/qa-pointer-v131.mjs --chromium=/path/to/chrome --out=docs/qa/v1.3.2/local/pointer
```

增强动作检查记录真实四肢网格、脚步交叉、手脚相位、模型空间支撑脚及近侧覆盖层级。提交的前景权重和绘制次序不能证明爪子在最终合成画面中可见，工具将图像审阅状态留待人工判断。真实 PNG 和记录的肢体区域用于检查耳朵是否持续遮住手爪、支撑与摆动是否清楚，以及根部连接是否自然。

## 发布证据与图册

v1.3.2 的分发范围以 [distributed-evidence.json](qa/v1.3.2/distributed-evidence.json) 为准。动作报告位于 `docs/qa/v1.3.2/motion-verified/`，综合报告位于 `docs/qa/v1.3.2/release-verified/`；中间转角下的强耳动作专项分列于 `shoulder-plus21-verified/` 和 `shoulder-minus21-verified/`。实际结果、源码哈希和审阅范围统一见 [验收入口](qa/acceptance.md)，目录名本身不构成通过结论。

本轮预览位于 [preview/release/v1.3.2/](../preview/release/v1.3.2/)，包含 [五方向](../preview/release/v1.3.2/turning-five-views.png)、[温柔步态](../preview/release/v1.3.2/walking-gentle.png)、[活泼步态](../preview/release/v1.3.2/walking-lively.png) 和 [停步恢复](../preview/release/v1.3.2/walking-stop.png)。各画面通过 [source-map.json](../preview/release/v1.3.2/source-map.json) 追溯到实际 PNG。

重建前，先按分发清单备齐图册所用的 PNG。两份报告若以 gzip 保存且尚未解压，在项目根目录执行下列命令，并按摘要记录核对解压后原始 JSON 的 SHA-256；`-k` 会保留压缩原件。

```sh
gzip -dk docs/qa/v1.3.2/release-verified/report.json.gz
gzip -dk docs/qa/v1.3.2/motion-verified/report.json.gz
```

原始报告与所选 PNG 就位后，运行：

```sh
python tools/build-update-preview.py --angles=docs/qa/v1.3.2/release-verified --motion=docs/qa/v1.3.2/motion-verified --out=preview/release/v1.3.2
```

图册制作只对实际运行截图裁切、等比例缩放和排版。输入不足时应补齐相应采样；重新采样产生新的源码与图片哈希，不能替换历史记录的来源。压缩报告可按验收页的方法解压并核对原始 JSON 哈希。

v1.3.1 的原始报告、工具记录和旧图册继续保留历史范围。`tools/build-release-contact.py` 读取旧版 `v1.3.1/words` 与 `v1.3.1/release`，用于重建那一版的联系图；它生成的画面不作为本轮预览。需要旧图册的完整字体时，可按 [字体说明](../tools/fonts/README.md) 获取并校验。
