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
| `references/` | 公开 URL、身份与证据类别、关键帧时间、测量限制及观察哈希 |
| 中文字体 | 日常预览所需的 WOFF2 子集、OFL 许可和完整字体获取脚本 |

## 有意不提交

官方、媒体、社区及玩家原图和视频，用户原始截图，整页 HTML，研究 HLS/TS，临时浏览器，`node_modules/`、staging 副本、旧阶段批量 QA 图片与嵌套的源码 ZIP 均不属于公开镜像。`dist/` 只保留最终角色 ZIP 与离线 HTML，供直接下载；本地构建的其余 `exports/` 不提交。完整 Noto OTF 可按[字体说明](../tools/fonts/README.md)下载并验证，日常预览不需要它。

运行图册和 `contact-sources.json` 已包含，保留每张实际采样的原始报告与像素哈希。图册的表情及方向来自最后走跑抬耳常数微调前；这些姿态的绘制逻辑未受该微调影响，最终走跑另有独立报告，不将两个阶段的源码哈希混写。大报告以 `report.json.gz` 无损保存，并附 `summary.json`；解压后能恢复原始 JSON 的同一 SHA。仓库只保存 [分发清单](qa/v1.3.1/distributed-evidence.json) 所列截图，不声称包含报告里全部逐帧 PNG。重新构建图册前可按验收页解压相应报告，并取得 [浏览器采样](integration.md) 所需输入。

## 公共镜像的工具调整

生产 `runtime/`、`pack/` 和 AI 图片不因公开发布而改写。公开版工具作以下路径整理：

- 浏览器检查从本项目的 `preview-host` 依赖解析 Playwright，不使用制作机器的 `/opt` 安装路径。
- Chrome 路径从 `--chromium` 或 `CHROMIUM_PATH` 提供；支持默认 Playwright 浏览器的工具也可使用它下载的 Chromium。
- `tools/package-release.py` 选择公开源码范围，包含 `host-fix/`，不要求或分发第三方参考裁图。
- 离线预览示例名称与当前清单版本一致。

这些是可移植构建入口调整，不等同于新一轮角色视觉或浏览器验收。

## 可选：本地生成源码归档

```sh
# 只统计当前公开工程，不生成 ZIP。
python tools/package-release.py --plan

# 明确执行后生成源码 ZIP 与逐文件 SHA 清单。
python tools/package-release.py --build-source
```

结果写入 `exports/`，不会递归包含该目录。归档器检查来源是否在打包中变化，并读回 ZIP 的 CRC 与内容哈希。这证明文件对应关系，不表示报告中的未测试项目已通过。实际验收入口为 [docs/qa/acceptance.md](qa/acceptance.md)。
