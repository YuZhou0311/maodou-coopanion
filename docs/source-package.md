# 公开源码范围与归档

本仓库是独立的 `YuZhou0311/maodou-coopanion` 源工程。生产 JavaScript、模型、图集、完整生成原图与必要构建工具保持原目录关系；可直接运行、编辑及构建安装包。根目录 [README](../README.md) 是安装与复现入口。

## 已包含

| 内容 | 说明 |
| --- | --- |
| `runtime/`、`pack/` | 正式角色源文件、模型、2048 图集与登记；`pack/figure.js` 需 staging 后安装 |
| `art-source/` | AI 原图、提示词与 25 个切件；`draft` 文件只使用制作表中明确指定的区域 |
| `preview-host/` | 自有预览代码、原生导入器入口、固定上游源码和许可证、npm 锁文件 |
| `host-fix/` | 鼠标释放问题的宿主补丁、基线、出处与回归脚本 |
| `tools/` | 图集、模型、字体、预览、数值检查与归档工具 |
| `preview/release/v1.3.2/` | 本轮方向、步态与停步预览，以及实际截图来源映射 |
| `references/` | 公开 URL、身份与证据类别、关键帧时间、测量限制及观察哈希 |
| 中文字体 | 日常预览所需的 WOFF2 子集、OFL 许可和完整字体获取脚本 |

## 有意不提交

官方、媒体、社区及玩家原图和视频，用户原始截图，整页 HTML，研究 HLS/TS，临时浏览器，`node_modules/`、staging 副本、旧阶段批量 QA 图片与嵌套的源码 ZIP 均不属于公开镜像。`dist/` 只保留最终角色 ZIP 与离线 HTML，供直接下载；本地构建的其余 `exports/` 不提交。完整 Noto OTF 可按[字体说明](../tools/fonts/README.md)下载并验证，日常预览不需要它。

## 发布证据与历史记录

v1.3.2 的报告与实际截图由 [本轮分发清单](qa/v1.3.2/distributed-evidence.json) 登记。动作、综合及中间转角强耳动作记录分别位于 `motion-verified/`、`release-verified/`、`shoulder-plus21-verified/` 与 `shoulder-minus21-verified/`。报告目录名表示用途，实际完成状态、范围和源码对应关系以 [验收入口](qa/acceptance.md) 为准。

本轮预览统一放在 [preview/release/v1.3.2/](../preview/release/v1.3.2/)，方向、两种性格的步态及停步图分别为 `turning-five-views.png`、`walking-gentle.png`、`walking-lively.png`、`walking-stop.png`；[source-map.json](../preview/release/v1.3.2/source-map.json) 记录排版所用的实际 PNG。报告可能登记本次运行采集的更多逐帧画面；公开镜像只分发清单明确列出的文件，不把未分发 PNG 算作仓库内容。重新生成图册时，需要保持输入 PNG、报告与来源映射一致。

v1.3.1 报告和 [旧分发清单](qa/v1.3.1/distributed-evidence.json) 保留历史用途，原时间、结果与源码哈希不改写为 v1.3.2。`preview/release/` 根目录的旧图册及 `contact-sources.json` 同样属于那一版的采样；新的轮廓与步态请查看 v1.3.2 子目录。

较大的报告以 `report.json.gz` 无损保存，并配有便于查看的摘要；原始 JSON 与压缩文件使用各自的哈希。重建本轮图册时，先解压 `release-verified` 与 `motion-verified` 的原始报告，按分发清单备齐输入 PNG，再运行 [接入文档中的图册命令](integration.md#发布证据与图册)。重新进行浏览器采样时，应使用新的本地输出目录，保留分发证据的原始字节。

## 公共镜像的工具调整

生产 `runtime/`、`pack/` 和 AI 图片不因公开发布而改写。公开版工具作以下路径整理：

- 浏览器检查从本项目的 `preview-host` 依赖解析 Playwright，不使用制作机器的 `/opt` 安装路径。
- 浏览器检查命令明确传入 `--chromium`；支持 `CHROMIUM_PATH` 或 Playwright 默认浏览器的工具也可使用相应入口，具体以工具参数为准。
- `tools/package-release.py` 选择公开源码范围，包含 `host-fix/`，不要求或分发第三方参考裁图。
- 离线预览示例名称与当前清单版本一致。

依赖及浏览器路径调整只用于可移植运行，不产生新的角色视觉或浏览器验收结论。增强动作检查与历史脚本可能具有不同 SHA，必须结合各报告记录的执行脚本及生产源码版本判断范围。

## 可选：本地生成源码归档

```sh
# 只统计当前公开工程，不生成 ZIP。
python tools/package-release.py --plan

# 明确执行后生成源码 ZIP 与逐文件 SHA 清单。
python tools/package-release.py --build-source
```

结果写入 `exports/`，不会递归包含该目录。归档器检查来源是否在打包中变化，并读回 ZIP 的 CRC 与内容哈希。这证明文件对应关系，不表示报告中的未测试项目已通过。实际验收入口为 [docs/qa/acceptance.md](qa/acceptance.md)。
