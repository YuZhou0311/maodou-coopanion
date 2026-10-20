# 拖拽释放修复 · v1.3.1

这里是 **Coopanion 桌面宿主的独立补丁**。角色 ZIP 内的适配层也做了防御处理，但旧宿主若根本没有发送释放、又删掉了鼠标按键字段，隔离 iframe 中的角色不可能自行知道鼠标已经松开。因此，只替换角色 ZIP 无法完整修复这一宿主路径；此目录不修改或绕过 iframe 的安全边界。

## 已确认的断链

基线来自用户公开 fork [`YuZhou0311/Coopanion` 的 `web/pet-app.js`](https://github.com/YuZhou0311/Coopanion/blob/main/packages/cortico-world-desktop-pet/web/pet-app.js)，取回时的 Git blob 为 `ddd0a6a8bc6b35d345b9bea03bdedfa8d99b7d6d`。原文 [pet-app.base.js](pet-app.base.js) 已重新计算 Git blob 并逐字节核对；完整来源、SHA-256 见 [base.json](base.json)。这里只读获取了原文，没有向该 fork 或上游仓库写入。

原来的 document `pointermove` 在 `e.buttons === 0` 时仅将页面局部 `pressing` 设为 `false`，随后仍向角色发送 `{x,y,t}` 的 `move`。它没有向角色发送 `up`/`cancel`，也没有转发 `buttons`。原生 `createPet` 内部的 `press` 因此仍为真，后续移动继续使角色处于 `drag`。原来的 `pointerup` 只绑定 stage，且没有处理失去 capture；window blur 只关闭菜单。

这条路径已在 CPU 测试中用**实际原宿主指针代码段、未修改的 native createPet 和角色适配器**复现：页面 `pressing=false`，角色 `pressing=true`，角色 `mode=drag`。这是可验证的代码缺陷，与用户症状一致；截图本身不能证明用户设备具体丢失的是哪一条事件。

## 补丁行为

- 明确观察到 `buttons=0` 时，宿主向角色发送 `cancel`，并保留后续 move 的真实按键、指针 ID 和指针类型。
- window 捕获阶段收取 `pointerup`/`pointercancel`；不再要求释放落在角色或 stage 之内。
- `lostpointercapture`、窗口 blur、document hidden、桌面窗口隐藏都会结束当前指针持有。清除 active pointer 在释放 capture 之前，避免重复取消。
- 正常 mouse-up 继续走原生速度计算与 throw/drop 路径。原来的跨显示器 `followCursor`、等待 resize、`shift` 和 `drop` 分支保留。
- 只跟踪接受的主指针，其他指针不会抢走正在进行的拖拽。
- 每次按下和取消都更新指针代次。旧跨屏请求迟到时不能移动下一次拖拽；明确松手后正在等待跨屏结果时，blur/hidden 仍可取消，不会卡在等待状态。
- 没有定时放手、距离放手或“离开角色就松开”。按钮仍按下时可以长期拖动，鼠标短暂离开窗口也不被单独视为释放。

角色适配器对收到的 `move.buttons === 0` 再做一层恢复，字段缺失表示未知。`cancel` 清除 native press，并从实际脚部位置放下，清除旧速度，避免把丢焦点误算成甩出或点击。预览页与单 HTML 预览也转发上述字段并补齐生命周期。

## 应用范围与命令

实际改动只涉及 Coopanion 中的：

```text
packages/cortico-world-desktop-pet/web/pet-app.js
```

在目标 Coopanion checkout 中先检查，核对差异后再应用：

```bash
git apply --check /path/to/maodou-coopanion/host-fix/pointer-release.patch
git apply /path/to/maodou-coopanion/host-fix/pointer-release.patch
```

若原文件已经更新，先进行人工合并，不要直接用本目录整份文件覆盖其他新功能。[pet-app.js](pet-app.js) 是完整候选文件，[pointer-release.patch](pointer-release.patch) 是最小差异。该补丁作为独立新仓中的交付文件，不代表已更改现有 Coopanion 安装。

## 验证与剩余边界

在本项目根目录运行 CPU 回归：

```bash
node host-fix/pointer-lifecycle.contract.mjs
node runtime/host-adapter.contract.mjs
node tools/qa-pointer-v131.mjs --chromium=/path/to/chrome --out=docs/qa/pointer-local
```

新增 CPU 回归的 15 项已通过，原适配契约的 14 项也通过。新报告为 [cpu-report.json](../docs/qa/drag-release-v1_3_1/cpu-report.json)。它覆盖旧缺陷复现、缺失 up 后按键零恢复、未知 buttons 不误放、30 秒保持、窗口级释放、正常快速甩出、lost capture、cancel、blur、隐藏、其他指针、点击、跨屏异步顺序、等待释放中失焦和旧请求迟到。**这些是合成 CPU 事件，不是 OS 指针捕获或用户机器上的实测。**

最终浏览器报告已完成：正式预览指针桥接与原样抽取的桌面宿主处理代码两组均为 **7/7**，驱动同一个实际 opaque iframe。见 [结果摘要](../docs/qa/v1.3.1/pointer/summary.json) 与 [原始报告 gzip](../docs/qa/v1.3.1/pointer/report.json.gz)。解压后的原文 SHA-256 为 `6b3b9a4c22b088c9334413ec4254ed925f8defb31de5c6f059be35d1ab3fade7`。旧默认目录中一次未完整落盘的报告不作为最终依据。

这些检查包含真实 mouse、CDP touch cancel，以及明确标注的合成 blur 和直接协议兼容检查；桌面部分仅对周边 Electron 接口做桩替代，不能扩大成用户设备或完整 Electron 的跨显示器实测。工具从 `preview-host` 安装的 Playwright 解析依赖，可用 `--chromium`、`CHROMIUM_PATH` 或 Playwright 自带 Chromium，详细准备步骤见 [接入与检查](../docs/integration.md)。

真实浏览器/桌面回归应保留原始时间戳、`isTrusted`、宿主发送的 pointer 数据、native `layout().pressing`、mode 和实际 touch 事件。重点流程如下：

1. 正常拖动后在角色外、stage 外、窗口边缘释放；确认 `pressing=false`，由 `drag` 转为 `air`，随后落地。
2. 快速甩出继续产生 `throw`，没有被 cancel 改为零速掉落。
3. 仅在 QA 会话吞掉一次 `pointerup` **和同次自动 `lostpointercapture`**，随后发送真实 `mouse.move`（buttons=0）；确认恢复。若不吞掉 lostcapture，提前恢复会掩盖按键零路径。
4. 保持按钮为 1 的长拖动、停住和移出角色；确认不会提前放手。省略 buttons 的协议消息也应保持按下。
5. 分别测试 capture 被移走、pointercancel、失去焦点、窗口隐藏；每次仅取消一次，之后鼠标再移动不应带着角色走。
6. 在实际 Electron 桌面宿主验证跨显示器持有与释放，尤其两屏缩放不同的情况。普通浏览器无法替代这一 OS 场景。

当 OS 完全没有向应用提供按钮、释放、失焦、隐藏或任何后续输入时，纯网页不能可靠判断“仍按着”还是“已在别的窗口松开”。本修复不靠超时猜测这两种状态。
