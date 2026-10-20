# v1.3.1 验收记录

**最终生产源码已冻结，角色 ZIP、离线预览、走跑停步和转向检查均完成。** 本页逐项区分最终版本与最后一次走跑耳朵常数微调前的记录；原始报告的时间、源码哈希和结果保持原样。

## 最终版本结果

| 项目 | 实际结果与范围 | 证据 |
| --- | --- | --- |
| 原生 ZIP | 10/10；固定 Coopanion 导入器实际解包、manifest 检查、PNG 解码与临时安装 | [原始 JSON](v1.3.1/native-import.json) |
| 左右走跑与停步 | 两种性格各左右走、左右跑，960 个真实 60 Hz 动作 tick，另 192 个停步恢复 tick；102/102 检查通过 | [摘要](v1.3.1/gait-final/summary.json) · [原文 gzip](v1.3.1/gait-final/report.json.gz) |
| 四肢与耳朵 | 脚横移、抬脚与手爪摆幅满足检查范围；实际帧中可见交替迈脚、摆爪和整耳随步态抬起。停步没有直接重置姿态 | [向右走第 39 帧](v1.3.1/gait-final/gentle-walk-right-f0039.png) · [第 54 帧](v1.3.1/gait-final/gentle-walk-right-f0054.png) · [停步第 24 帧](v1.3.1/gait-final/gentle-walk-right-stop-f0024.png) |
| 转向与几何 | 159 个真实转向观测（−75° 到 +75° 及零点附近）；头、身体和两耳未发现翻转三角形，头宽保持绘制体积 | [综合摘要](v1.3.1/release-final/summary.json) · [原文 gzip](v1.3.1/release-final/report.json.gz) |
| 实际释放与拖拽 | 正式预览指针桥接、抽取原样桌面宿主处理代码两组各 7/7，均驱动真正的 opaque iframe | [指针摘要](v1.3.1/pointer/summary.json) · [原文 gzip](v1.3.1/pointer/report.json.gz) |
| 正常甩出 | 最终综合检查保留真实 mouse 输入、原始时间戳、原生 grab / throw / 落地路径 | [综合摘要](v1.3.1/release-final/summary.json) |
| 离线预览 | 最终 HTML 以 `file:` 打开并阻断 HTTP/HTTPS；成功加载、绘制、读回 25 表情及 28 动作；综合检查 24/24 | [综合摘要](v1.3.1/release-final/summary.json) · [构建记录](standalone-build.json) |
| 指针 CPU 回归 | 新宿主生命周期 15/15；原适配器契约 14/14。合成事件范围与真实浏览器分别记录 | [CPU 原始 JSON](drag-release-v1_3_1/cpu-report.json) · [宿主说明](../../host-fix/README.md) |

最终走跑逐帧检查中，所暴露的头、身体和两耳网格没有翻折，角色完整边界没有越出画布。检查脚本没有暴露所有五官及四肢的逐三角形数据，所以这一结论不扩展为每个部件的自动几何认证。数值检查也不代替视觉判断；图册和精选实际帧供直接查看。

指针浏览器记录包括真实鼠标输入、CDP touch cancel、明确标注的合成 blur，以及直接协议兼容检查。桌面宿主部分对周边 Electron 接口做桩替代，**没有宣称已在用户机器或完整 Electron 多显示器环境实测**。旧宿主缺失释放消息时需要同时应用 [host-fix](../../host-fix/README.md)，只更新角色 ZIP 不能补回未发送的信息。

## 实际画面审阅

本轮审阅了正面、左右关键侧面、走跑连续采样、停步恢复、大幅扇耳和耳朵招手。头部仅作小幅缩短，采用原先选定的正面轮廓；正面躯干不再保留旧的内部手臂线，外耳根原有折痕阴影已清理。侧转时近耳有前景遮挡，整耳升起时根部继续连接头部。该目视结论覆盖已列出的画面与状态，不表述为所有连续参数组合均已人工审阅。

- [最终正面](v1.3.1/release-final/angle-front-0-transparent.png)
- [最终向右 45°](v1.3.1/release-final/angle-right-45-transparent.png) 与 [75°](v1.3.1/release-final/angle-right-75-transparent.png)
- [活泼跑步](v1.3.1/gait-final/lively-run-left-f0054.png) 与 [停止后恢复](v1.3.1/gait-final/lively-run-left-stop-f0024.png)
- [大幅扇耳](v1.3.1/motion/gentle-flap-f0047.png) 与 [单耳招手](v1.3.1/motion/gentle-ear-wave-f0086.png)
- [角色一览](../../preview/release/character-overview.png)、[25 表情图册](../../preview/release/expression-gallery.png)、[方向图册](../../preview/release/turning-preview.png)

最后三张图册是实际截图的裁切与排版，原始来源见 [contact-sources.json](../../preview/release/contact-sources.json)。其中方向和表情采样发生在最后两项走跑抬耳基准调整前；这些图册姿态的代码未受该调整影响。最终走跑画面以上表的 `gait-final` 为准。

## 最后一次微调前的证据

最后生产改动只增加走路、跑步的整耳基础抬起量：walk `.14 → .30`，run `.23 → .37`。表情、脸部、头形与独立耳朵招手 / 扑腾 / 伸展 / 庆祝函数没有因这两项常量改变。

| 较早 v1.3.1 记录 | 保留结论 | 证据 |
| --- | --- | --- |
| 53 词实际运行采样 | 25 表情、28 动作逐项采样，无记录的运行错误；这不是 53 条全长动作都逐帧验收 | [摘要](v1.3.1/words/summary.json) · [原文 gzip](v1.3.1/words/report.json.gz) |
| 两性格完整动作追踪 | 134/134、2,464 个真实 tick；含走跑和四类大幅耳动作。大幅耳动作逻辑未变；其中旧走跑结果不替代最终 `gait-final` | [摘要](v1.3.1/motion/summary.json) · [原文 gzip](v1.3.1/motion/report.json.gz) |
| 数值动画回归 | 71 项检查，记录四肢/耳朵数值及脸部保留比较；属于微调前的 CPU 检查 | [原始 JSON](animation-motion-upgrade.json) |
| 图册原方向报告 | 保留图册所用旧方向 PNG 的哈希，用于追溯；最终综合验收使用 `release-final` | [摘要](v1.3.1/release/summary.json) · [原文 gzip](v1.3.1/release/report.json.gz) |

没有将旧 v1.3.0 结果改写为新版结果，也没有把同次未完整落盘的旧 pointer 报告当作最终依据。最终 pointer 报告中的宿主和适配器源码哈希与当前生产一致；后续只变更了走跑常量与许可链接，不影响该指针范围。

## 短时性能测量

最终综合检查使用 Chrome 155、SwiftShader **软件 WebGL**、`640×394` 画布，显示比例 `1.35`，连续转向窗口约 8 秒。

| 指标 | 实测 |
| --- | ---: |
| 角色完成帧样本 | 467 |
| 角色完成帧速率 | 58.363 FPS |
| 角色完成帧间隔 P95 | 20.8 ms |
| 最大单次完成帧间隔 | 121.7 ms |

这里记录的是角色完成帧回调，页面自己的 rAF 不被当作角色 FPS。短时软件渲染结果不能承诺所有设备稳定 60 FPS，也没有把固定步长录帧当作实时性能证据。原始每帧间隔保留在 `release-final` 报告中。

## 冻结文件与证据哈希

| 文件 | SHA-256 |
| --- | --- |
| `runtime/animation.js` | `eff7eb45a14446db9d16777e02cc3a22bb33b99a5c3f13b8f9a4b49562e43522` |
| `runtime/painted-figure.js` | `961aa25d38680d00842eb2c0dc4abb3a15142983f9a7470182715c930a5df98e` |
| `runtime/host-adapter.js` | `e1a46a0268b4debcc0c0bc0e3a00461118cb7624e8f31eb219166678cba48e5e` |
| `pack/assets/atlas.png` | `64dc4dcc002ce7857735fed59ee43837e24dec1df4d7d7e0255075f0c9987108` |
| 最终 `gait-final/report.json` 解压原文 | `63f585112a22d20801c2b7f06b3fdab8876df78cf3f0c3574e448acd0e4faba3` |
| 最终 `release-final/report.json` 解压原文 | `0d5f878c382e263c8d1cf79b0f71f943aef5e9d5ac6a6a66718c2278068330fc` |
| 最终 `pointer/report.json` 解压原文 | `6b3b9a4c22b088c9334413ec4254ed925f8defb31de5c6f059be35d1ab3fade7` |

全部安装文件与哈希见 [dist](../../dist/README.md)。报告包含当时生产源码的始末哈希；最终综合与走跑检查期间来源保持不变。公开工具仅调整 Playwright 与 Chrome 查找路径，所以它们当前脚本 SHA 可能不同于原始报告记录的执行脚本 SHA，不代表重新执行了一轮测试。

## 大报告的完整性与恢复

超过 250 KB 的原始报告用 gzip 无损保存，配有便于 GitHub 阅读的 `summary.json`。摘要提取原状态、检查项、范围、源哈希与恢复方法，不产生新的通过结论。所有 gzip 已解压并逐字节核对原始 JSON；原始 JSON 的 SHA 与压缩文件自身 SHA 分别记录。

例如，在相应目录执行：

```sh
gzip -dk report.json.gz
sha256sum report.json
# macOS 也可使用：shasum -a 256 report.json
```

重建已包含图册前解压 `words` 与 `release` 的报告即可。报告记录了当次生成的完整截图清单；仓库仅分发 [distributed-evidence.json](v1.3.1/distributed-evidence.json) 所列的 82 张精选实际截图，包括最终 24 张走跑与停步图、最终转向/指针图、图册所需像素与大幅耳动作峰值。未分发的逐帧 PNG 不被算成仓库文件。

运行格式为 Coopanion manifest 2 / API 2，方向为约 ±75° 的有限二维转向，不包含 Cubism `moc3` / Editor 工程。安装与构建入口见 [README](../../README.md)。
