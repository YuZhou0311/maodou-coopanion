# v1.3.2 验收记录

**最终角色 ZIP、离线预览、转向、步态和大幅耳动作检查已完成。** 本页依据最终冻结源码的实际报告，分别记录自动检查、人工抽样和短时性能测量。四份最终浏览器报告均为 `complete`、`passed: true`、`sourcesUnchanged: true`；报告原有的 `visualPassed` / `smoothnessPassed` 未改写成人工结论。

## 最终自动检查

| 项目 | 实际结果与范围 | 证据 |
| --- | --- | --- |
| 原生角色 ZIP | **10/10**；固定的 Coopanion 原生导入器实际读取 ZIP、校验 manifest、解码全部 PNG、临时安装并逐文件读回核对 | [原始 JSON](v1.3.2/native-import.json) |
| 离线 HTML 构建 | **9/9**；核对源文件、内嵌图集、脚本与模型字节，写出后读回。这是构建检查，浏览器离线运行另见下一项 | [原始 JSON](v1.3.2/standalone-build.json) |
| 综合运行 | **24/24**；原生 opaque iframe、159 个转向观测、真实鼠标点按/拖拽/甩出/落地、说话嘴型、两种性格、完成帧计时及 `file:` 离线预览 | [摘要](v1.3.2/release-verified/summary.json) · [原文 gzip](v1.3.2/release-verified/report.json.gz) |
| 两种性格的左右走跑与耳动作 | **207/207**；2,464 个实际动作 tick，另 192 个停步恢复 tick。覆盖左右走、左右跑、耳朵招手、扇耳、伸展和庆祝 | [摘要](v1.3.2/motion-verified/summary.json) · [原文 gzip](v1.3.2/motion-verified/report.json.gz) |
| 向右 21° 的大幅耳动作 | **35/35**；温柔、活泼两种性格的耳朵招手与扇耳，共 578 个实际 tick | [摘要](v1.3.2/shoulder-plus21-verified/summary.json) · [原文 gzip](v1.3.2/shoulder-plus21-verified/report.json.gz) |
| 向左 21° 的大幅耳动作 | **35/35**；相同动作范围，共 578 个实际 tick | [摘要](v1.3.2/shoulder-minus21-verified/summary.json) · [原文 gzip](v1.3.2/shoulder-minus21-verified/report.json.gz) |

动作与恢复检查合计 **3,812 帧**：`2,464 + 192 + 578 + 578`。每一帧都通过原生宿主提交并等待真实 `1/60 s` tick 完成；这些是固定步进检查，不能换算成设备的实时帧率。159 个转向观测和短时性能窗口单独记录，不混入该总数。

综合转向检查覆盖约 −75° 到 +75° 及零点附近，检查头、身体与双耳三角形及头部宽度。动作检查进一步覆盖头、身体、双耳、双臂、双脚八个部件的几何，检查可见整体边界是否越出渲染区域。五官网格不在逐三角形检查范围内。

步态检查读取实际手脚网格中心、抬脚值、支撑脚底与层级诊断，验证双脚前后交错、手脚反向配合、单脚支撑和停止后的连续恢复。支撑脚结论以模型坐标为范围，不等于外层宿主 SVG 移动时的世界坐标锁脚；近侧手爪是否被耳朵遮住仍须看实际 PNG。报告没有记录运行错误，保留了 SwiftShader 的 `GPU stall due to ReadPixels` 截图读回警告，没有将这些警告删除或写成“零警告”。

## 人工画面复核

本轮针对耳根色块接缝、头耳交界凹口和侧耳轮廓破折，复核了正面、左右 21°、35°、38°、41° 等关键中间方向，并结合 15°、30°、45°、75° 侧向画面检查轮廓延续。已审阅的状态中，原先明确可见的接缝和异常凹凸未再出现；左右 21° 的大幅耳动作指定峰值画面中，耳根仍连接完整，没有出现缺口。此结论限定于审阅过的画面，不表示所有连续参数组合均经人工检查。

最终四张正式拼图已逐图复核：其中 **21 张卡片**均来自实际透明 PNG，来源 SHA 与 [source-map.json](../../preview/release/v1.3.2/source-map.json) 一致。另外抽看两种性格、左右跑步的双脚交叉、抬脚峰值和停止后第 24 帧，共 12 张实际 PNG。近侧手爪能在腹前看清，远侧手爪随相位自然遮挡；双脚可见交错重叠、一抬一落，停止后恢复落地，抽样中未发现新的步态退化。

| 画面入口 | 内容 |
| --- | --- |
| [五方向图册](../../preview/release/v1.3.2/turning-five-views.png) | 正面、左右关键侧向，检查头耳轮廓与遮挡 |
| [温柔方案步态](../../preview/release/v1.3.2/walking-gentle.png) | 左右行走的交错与抬脚采样 |
| [活泼方案步态](../../preview/release/v1.3.2/walking-lively.png) | 活泼方案的四肢与耳朵联动 |
| [停步图册](../../preview/release/v1.3.2/walking-stop.png) | 左右行走停止后的落地恢复 |
| [向右 21° 招手](v1.3.2/shoulder-plus21-verified/lively-ear-wave-f0086.png) · [扇耳](v1.3.2/shoulder-plus21-verified/lively-flap-f0047.png) | 大幅抬耳时的头耳接合 |
| [向左 21° 招手](v1.3.2/shoulder-minus21-verified/lively-ear-wave-f0086.png) · [扇耳](v1.3.2/shoulder-minus21-verified/lively-flap-f0047.png) | 对称方向的接合与轮廓 |

这是**有限人工抽样通过**。自动报告中的 `visualPassed: null`、各动作的人工审阅待办字段保持原文，不通过修改报告制造自动视觉认证。透明截图显示角色自身渲染结果，不包括宿主外层 SVG 变换和粒子。

## 拖拽、离线预览与词库范围

最终综合报告使用可信的真实鼠标输入：点击触发原生 `poke`，移动进入 `drag` 并触发 `grab`，快速释放触发 `throw`，随后从 `air` 到达原生 `land`；落地时脚底与宿主地面一致。说话输入实际改变嘴型，停止输入后回到休息状态；温柔与活泼方案实际切换，并执行已登记的耳朵招手动作。

离线 HTML 以 `file:` 打开，在阻断 HTTP/HTTPS 的条件下成功加载并完成绘制，未产生 HTTP/HTTPS 请求。内嵌角色与模型字节符合最终打包结果，界面读回 **25 个表情、28 个动作**。本次保留全部 53 个词条，但**没有重新逐项运行全部 53 个词条**；旧版逐词采样保留于 [v1.3.1 验收记录](acceptance-v1.3.1.md)，不算作新的 v1.3.2 测试。

v1.3.1 的指针生命周期与取消释放报告仍作为未改动宿主适配器的历史证据保留。本次最终综合检查重新执行了正常拖拽释放路径，没有重新声称完整覆盖旧报告中所有取消、失焦、触摸分支。旧宿主若没有发送释放消息，需要同时应用 [host-fix](../../host-fix/README.md)；角色包本身不能补回宿主未发送的信息。

原生导入检查在隔离的临时安装目录完成，浏览器使用原生 opaque iframe。**没有在用户机器的完整 Electron 桌面、多显示器或所有系统缩放组合中实测。**

## 短时性能测量

最终综合报告在 **SwiftShader 软件 WebGL** 环境、`640×394` 角色画布、显示比例 `1.35` 下，执行约 8 秒的连续转向窗口。下面只使用角色完成帧回调；页面自身的 rAF 次数不作为角色 FPS。

| 指标 | 实测 |
| --- | ---: |
| 角色完成帧样本 | 468 |
| 角色完成帧速率 | 58.555 FPS |
| 角色完成帧间隔 P95 | 21.6 ms |
| 最大单次完成帧间隔 | 84.7 ms |

数据来自一次固定时间窗口，没有为取得更好数字而重复取样。计时范围内首末完成帧间隔为约 7,975.4 ms；原始全部间隔在综合报告 `sweep.characterFrames` 中保留。该结果不保证用户 GPU、完整 Electron 或其他设备稳定 60 FPS，也不把固定步长动作录帧作为实时流畅度证明。

## 冻结源码与文件哈希

公开源码、打包来源和四份最终运行报告对应以下生产文件；最终检查期间源码始末哈希一致。

| 文件 | SHA-256 |
| --- | --- |
| `runtime/painted-figure.js` | `8147c0d9b576da8429a95e1a59c7ba2c3888c3fc067385e94fe316c379b62e73` |
| `runtime/animation.js` | `a1126067d31a4ecf42bd96030e094a64679974ab0780348b4774708006c7cf44` |
| `runtime/atlas-renderer.js` | `869ff6be6312be3657ef169670204200b0e387312ad7172c0f857250b89ccace` |
| `runtime/host-adapter.js` | `e1a46a0268b4debcc0c0bc0e3a00461118cb7624e8f31eb219166678cba48e5e` |
| `pack/model.json` | `374944e022cb3da30ec3d14b1c03c38c363ae8e74defd5db582f9da2f2f89917` |
| `pack/assets/atlas.png` | `64dc4dcc002ce7857735fed59ee43837e24dec1df4d7d7e0255075f0c9987108` |

最终安装 ZIP 与离线 HTML 的实际字节数和 SHA-256 见 [dist 文件说明](../../dist/README.md)。完整来源清单、精选截图及图册来源索引见 [distributed-evidence.json](v1.3.2/distributed-evidence.json)。本次动作报告记录的执行脚本 SHA 与公开的 `tools/qa-motion-v131.mjs` 一致；历史 v1.3.1 工具与报告保留各自原有范围。

## 原始报告完整性与历史记录

四份大型报告采用 gzip 无损保存，旁边的 `summary.json` 摘取原状态、检查范围和哈希，便于阅读。发布前已将 gzip 解压，与完整原始 JSON 逐字节核对。以下哈希属于**解压后的原文**：

| 报告 | 原始字节数 | 原文 SHA-256 |
| --- | ---: | --- |
| `release-verified/report.json` | 824,080 | `258eebd7d2226653a2fac71e13d1428903fafda39c84721f315effdfaf7e7d73` |
| `motion-verified/report.json` | 21,677,962 | `0ea0495ec3f57e46d1d5992fd5296a6919ad69d36a4a56d4f68f5adbe2ce0bd3` |
| `shoulder-plus21-verified/report.json` | 4,627,108 | `530c818834e23290eb36192b184a437bc30d21cf7a281f98a44b0d3a01ed97a5` |
| `shoulder-minus21-verified/report.json` | 4,625,968 | `e71be70cb1c1698d14e69983bac4657d1df35e4b7837c7d94124bdbe9a90ef5e` |

在相应报告目录恢复原文：

```sh
gzip -dk report.json.gz
sha256sum report.json
# macOS 也可使用：shasum -a 256 report.json
```

仓库分发清单中列出的 **77 张实际 PNG**：综合检查 27 张、动作检查精选 42 张、左右 21° 强耳检查各 4 张。原报告保留当时完整的截图清单，未分发的逐帧 PNG 不被算成仓库文件。四张正式图册按来源清单编排实际截图，没有重画角色。

[v1.3.1 验收页](acceptance-v1.3.1.md) 已按原文保留。修复过程中存在尚未通过的候选迭代，它们不作为本次发布证据分发；本页通过结论仅对应上述最终冻结文件与最终报告，不延伸到此前候选版本。

运行格式为 **Coopanion manifest 2 / API 2**，采用绘画图集与网格变形，提供约 ±75° 的有限二维转向。包内不含 Cubism `moc3`、`model3.json` 或 Editor 工程。安装与构建入口见 [README](../../README.md)。
