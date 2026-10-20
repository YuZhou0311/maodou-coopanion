# 可直接使用的文件 · v1.3.4

本版修复正视图的头耳连接异常阴影，以及侧转时后脑轮廓畸变、变平。以下文件由最终冻结源码构建，与最终运行检查使用的文件逐字节一致。

| 文件 | 字节数 | 用途 |
| --- | ---: | --- |
| [Maodou-Coopanion-v1.3.4.zip](Maodou-Coopanion-v1.3.4.zip) | 2,569,192 | Coopanion「装扮 → 形象 → 导入」的角色包 |
| [Maodou-Offline-Preview-v1.3.4.html](Maodou-Offline-Preview-v1.3.4.html) | 4,433,636 | 保存到本地后双击打开；内嵌角色、图集和中文字体 |

SHA-256：

```text
699f4d1a4ba4a2278bae65b7693d81c4cbb02799002e73137b578a1eaeae5289  Maodou-Coopanion-v1.3.4.zip
6812a227fa23e1e6f03d4c757568a4d5544850529112610ea28b2031504081b5  Maodou-Offline-Preview-v1.3.4.html
```

角色 ZIP 通过固定原生导入器 **10/10** 检查，包括实际临时安装和逐文件读回。离线 HTML 构建检查 **9/9**，且以 `file:` 打开并阻断 HTTP/HTTPS 后完成绘制，请求数为 0。角色 ID 为 `maodou-shiny`，导入器显示版本应为 `1.3.4`。

最终综合运行 **24/24**，包含 165 个转向观测和真实鼠标交互；两种性格的耳朵招手、扇耳、伸展在 +22° 下检查 **49/49**，共 1,036 个实际固定步进帧。另通过 1,537 帧 CPU 几何回归和正面材质回归。检查范围、有限人工审阅、源码哈希和实际截图见 [验收记录](../docs/qa/acceptance.md)，实现说明见 [v1.3.4 版本说明](../docs/releases/v1.3.4.md)。

[修复前后对照](../preview/release/v1.3.4/front-and-turning-comparison.png)展示正面及左右 30° 的变化，[关键转角图册](../preview/release/v1.3.4/turning-key-angles.png)展示最终转向。图册来自实际运行截图。

格式为 **Coopanion manifest 2 / API 2** 的绘画网格，不包含 Cubism `moc3` / Editor 工程。GitHub 的 “Download ZIP” 是源码仓库归档，安装应使用上面的 `Maodou-Coopanion-v1.3.4.zip`。

旧宿主若遗漏释放消息，需同时应用 [host-fix](../host-fix/README.md) 中针对相应基线的指针补丁；更新角色 ZIP 不会自动修改宿主。

目录中的较早版本文件保留为历史下载。历史验收原文：[v1.3.3](../docs/qa/acceptance-v1.3.3.md) · [v1.3.2](../docs/qa/acceptance-v1.3.2.md)。
