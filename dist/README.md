# 可直接使用的文件 · v1.3.3

本版修复约 22° 的头耳外缘台阶、耳根旧阴影扩散和走路双臂同开同合。下面两个文件由最终冻结源码构建，与最终运行检查使用的文件一致。

| 文件 | 字节数 | 用途 |
| --- | ---: | --- |
| [Maodou-Coopanion-v1.3.3.zip](Maodou-Coopanion-v1.3.3.zip) | 2,569,616 | Coopanion「装扮 → 形象 → 导入」的角色包 |
| [Maodou-Offline-Preview-v1.3.3.html](Maodou-Offline-Preview-v1.3.3.html) | 4,434,699 | 保存到本地后双击打开；内嵌角色、图集和中文字体 |

SHA-256：

```text
1535b422e3f5abd737b0cc664e48033021578a474f659ca51ee3b7f59e34ce9e  Maodou-Coopanion-v1.3.3.zip
fd4255d1bd5e291d3455484df6443c8fc5e9937f131fc39b8871c46e1308a361  Maodou-Offline-Preview-v1.3.3.html
```

角色 ZIP 通过固定原生导入器 **10/10** 检查，包括实际临时安装和逐文件读回。离线 HTML 构建检查 **9/9**，且在最终综合检查中以 `file:` 打开，阻断 HTTP/HTTPS 后完成绘制。角色 ID 为 `maodou-shiny`，导入器显示版本应为 `1.3.3`。

最终综合运行 **24/24**，左右走跑与耳动作 **231/231**，另一侧 −22° 耳动作 **35/35**。检查范围、真实计时环境、有限人工抽样、源文件哈希与实际 PNG / MP4 均见 [验收记录](../docs/qa/acceptance.md)。本轮没有重新逐项运行全部 53 个词条，也没有将软件 WebGL 的短时结果写成所有设备的帧率保证。

格式为 **Coopanion manifest 2 / API 2** 的绘画网格，不包含 Cubism `moc3` / Editor 工程。GitHub 的 “Download ZIP” 是源码仓库归档，应使用上面的 `Maodou-Coopanion-v1.3.3.zip` 导入。

旧宿主若遗漏释放消息，需同时应用 [host-fix](../host-fix/README.md) 中针对相应基线的指针补丁；更新角色 ZIP 不会自动修改宿主。

目录中的较早版本安装文件和离线文件保留为历史下载，不代表本版结果。v1.3.2 的验收原文另存于 [历史验收记录](../docs/qa/acceptance-v1.3.2.md)。
