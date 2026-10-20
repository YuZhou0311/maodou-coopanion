# v1.3.4 验收记录

**本版修复正面耳根异常暗带和侧转后脑被削平的问题。** 以下结果对应最终 1.3.4 源码、安装包及离线预览。生产源码在实际浏览器检查开始与结束时一致；旧版验收原文保留在 [v1.3.3 历史记录](acceptance-v1.3.3.md)。

## 本轮程序检查

| 项目 | 实际结果与范围 | 证据 |
| --- | --- | --- |
| 头耳几何回归 | **通过**；68 个局部连接案例、1,537 个 CPU 动画帧；检查中间角度的后脑圆弧、面积、原绘画截面和局部连接；头耳负面积三角形为 0 | [结果及源码哈希](v1.3.4/cpu-regressions.json) · [检查代码](../../tools/check-hood-geometry.mjs) |
| 头耳材质回归 | **通过**；9 个固定几何转角样本，覆盖正面、微小转角和侧向；检查共点 UV、零权重顶点坐标，以及几何、alpha、自由耳段权重保持；底层 root material 契约同时通过 | [结果](v1.3.4/cpu-regressions.json) · [检查代码](../../tools/check-hood-material.mjs) |
| 原生角色 ZIP | **10/10**；固定的上游导入器读取 ZIP、校验 manifest、解码 PNG，实际在隔离临时目录安装并逐文件读回 | [原始 JSON](v1.3.4/native-import.json) |
| 离线 HTML 构建 | **9/9**；校验内嵌模型、图集、脚本和字体，写出后读回核对 | [原始 JSON](v1.3.4/standalone-build.json) |
| 综合浏览器运行 | **24/24**；原生 opaque iframe、165 个转向观测、真实鼠标点按/拖拽/甩出/落地、说话嘴型、两种性格及直接打开离线 HTML | [完整原始 JSON](v1.3.4/release-verified/report.json) |
| 两种性格的耳部动作 | **49/49**；温柔和活泼两种方案的耳朵招手、扇耳、伸展，方向为 +22°，共 1,036 个实际固定步进帧，6 张峰值截图 | [摘要](v1.3.4/ear-motion/summary.json) · [完整原文 gzip](v1.3.4/ear-motion/report.json.gz) |

CPU 动画帧与实际浏览器帧是两项独立检查，不相加冒充运行帧数。耳部动作按 `1/60 s` 模拟步长逐帧提交并等待实际 tick 完成，不能由此推算设备的实时帧率。

165 个转向观测包括 −75° 到 +75° 的 151 个整数角度、零点附近 8 个非零探针，以及旧材质起步阈值附近 6 个探针。程序检查头部、身体和双耳的三角形与头部宽度；实际透明截图另外覆盖 ±15°、20°、21°、22°、23°、25°、30°、35°、38°、41°、45°、60°、75° 和正面，重点补上旧版五方向图册未充分反映的中间转角。

耳部动作几何检查覆盖头、身体、双耳、双臂和双脚八个部件。五官三角形不在逐帧检查范围内。几何检查用于阻止明确的折叠和轮廓退化，阴影、遮挡与观感另由实际画面审阅判断。

## 实际画面复核

[修复前后对照](../../preview/release/v1.3.4/front-and-turning-comparison.png)并列展示 v1.3.3 与 v1.3.4 的正面、向右 30°、向左 30°。在本轮审阅的最终画面中，正面头耳连接原有的灰紫色暗带已消除，侧转时后脑恢复圆润弧线，原先约 20°–40° 的长段削平不再出现。另检查了低角度过渡、±22° 连接、±35° 后脑，以及 45°、75° 的关键方向。

![修复前后对照](../../preview/release/v1.3.4/front-and-turning-comparison.png)

[关键转角图册](../../preview/release/v1.3.4/turning-key-angles.png)和 [完整角度原图](v1.3.4/release-verified/)提供最终形体、头耳连接及近耳遮挡的实际样本。耳朵招手、扇耳和伸展的峰值图保存在[耳动作目录](v1.3.4/ear-motion/)。

图册只编排真实运行截图，并裁切共同透明外边距；没有重绘、补色、锐化或缩放角色像素。旧版基线来自提交 `ec6001d56197ef21498dbd1600482462646fc4b6`，出处见 [基线记录](v1.3.4/baseline/provenance.json)。两版在独立运行中采样，启动时钟和呼吸相位并非逐像素锁定；对照用于判断材质和轮廓，不作为完全相同时刻的像素差分。每张图的来源与 SHA-256 见 [图册索引](../../preview/release/v1.3.4/source-map.json)。

上述结论属于**有限人工画面抽样**。报告原有的 `visualPassed: null`、`smoothnessPassed: null` 保持原文，未改成自动视觉认证；本轮没有逐一审阅所有角度、表情和动作参数组合。

## 交互与离线验证

综合检查使用真实鼠标输入完成点击 `poke`、拖拽 `grab`、快速释放 `throw`，随后经过 `air` 到达原生 `land`。说话输入实际驱动嘴型，停止后恢复；温柔、活泼两种方案均实际切换。

离线 HTML 以 `file:` 打开，在阻断 HTTP/HTTPS 的条件下完成加载和绘制，HTTP/HTTPS 请求数为 **0**。界面读取到 25 个表情和 28 个动作，内嵌资源与最终暂存角色、模型一致。本轮没有重新逐项运行全部 53 个词条，也没有重新验收左右走跑的全部轨迹；这些实现未改动，历史结果仅对应历史版本。

浏览器使用 Chromium headless shell 和 SwiftShader 软件 WebGL，角色画布为 `640×394`；综合检查显示比例为 `1.35`，耳动作检查为 `0.9`。安装检查在隔离临时目录中完成，运行检查使用固定上游的原生 opaque iframe；没有在用户机器的完整 Electron 桌面、多显示器或所有系统缩放组合中实测。综合报告附有一次约 8 秒的完成帧计时，不作为所有设备稳定 60 FPS 的保证。

两份最终运行报告均为 `status: complete`、`passed: true`、`sourcesUnchanged: true`，错误列表为空。报告保留截图读回时的 `GPU stall due to ReadPixels` 警告。

## 源码与发布文件一致性

最终运行前后校验了 15 个生产来源文件。主要变更文件的 SHA-256 如下；完整列表见综合报告的 `sourcesBefore.stage.sourceFiles`，与 `sourcesAfter` 一致。

| 文件 | SHA-256 |
| --- | --- |
| `runtime/painted-figure.js` | `2f90c2894a5cd60a383603478edf975bd4536139bc6a120fe86555982eeaaba1` |
| `runtime/hood-geometry.js` | `8e00870c745666d59929589d0fadc0f2887723b5879d3d408b76d6d8d0b7f7d6` |
| `runtime/hood-material.js` | `bc0ec9bca2fc990d62e01f37b607e5be29916d252a4605a672beefc5ffd00755` |
| `pack/model.json` | `590820ee4ffc1ffec4bbe7612c0fa2362b0546699648616b9c8eaff429fa9377` |
| `pack/assets/atlas.png` | `64dc4dcc002ce7857735fed59ee43837e24dec1df4d7d7e0255075f0c9987108` |

安装 ZIP 和离线 HTML 从最终验证过的构建产物复制到 `dist/`，随后逐字节核对。下载、字节数及 SHA-256 见 [dist 文件说明](../../dist/README.md)。

## 报告分发与复现

公开证据包含 54 张原始 PNG：旧版基线 13 张、最终综合检查 35 张、耳动作 6 张。对照图册单独位于 `preview/release/v1.3.4/`。完整分发路径、字节数及哈希见 [distributed-evidence.json](v1.3.4/distributed-evidence.json)。

较大的耳动作报告使用 gzip 无损压缩，原文为 **9,196,464 字节**，原文 SHA-256 为 `155ef96f7d5f15b50c201f0079e9d187fb3a39c03fa07f4e9501448cb96314e4`。解压后即可读取所有逐帧状态：

```sh
gzip -dk docs/qa/v1.3.4/ear-motion/report.json.gz
sha256sum docs/qa/v1.3.4/ear-motion/report.json
```

核心回归与构建入口：

```sh
node tools/check-root-material.mjs
node tools/check-hood-material.mjs
node tools/check-hood-geometry.mjs
npm run stage
node preview-host/validate-native.mjs --build-zip=exports/Maodou-Coopanion-v1.3.4.zip --report=docs/qa/v1.3.4/native-import.json
node tools/build-standalone.mjs --out=exports/Maodou-Offline-Preview-v1.3.4.html --report=docs/qa/v1.3.4/standalone-build.json
```

浏览器检查需提供本机可用的 Chromium 路径：

```sh
node tools/qa-release.mjs --chromium=/path/to/chromium --software-webgl --scale=1.35 --out=docs/qa/v1.3.4/release-verified --offline=exports/Maodou-Offline-Preview-v1.3.4.html
node tools/qa-motion-v133.mjs --chromium=/path/to/chromium --software-webgl --scheme=both --only=ear-wave,flap,stretch --gesture-yaw=22 --out=docs/qa/v1.3.4/ear-motion
```

## 格式与历史范围

运行格式为 **Coopanion manifest 2 / API 2**，使用绘画图集与二维网格变形，提供约 ±75° 的有限转向，不包含完整背视图、360° 模型或 Cubism Editor 工程。本次实现详见 [v1.3.4 版本说明](../releases/v1.3.4.md)，安装入口见 [README](../../README.md)。旧宿主的指针释放修补继续按 [host-fix 说明](../../host-fix/README.md)处理。
