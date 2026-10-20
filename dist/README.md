# 可直接使用的文件 · v1.3.2

以下两个文件来自最终冻结源码，已实际读回核对字节数与 SHA-256。

| 文件 | 字节数 | 用途 |
| --- | ---: | --- |
| [Maodou-Coopanion-v1.3.2.zip](Maodou-Coopanion-v1.3.2.zip) | 2,568,197 | Coopanion「装扮 → 形象 → 导入」使用的角色包 |
| [Maodou-Offline-Preview-v1.3.2.html](Maodou-Offline-Preview-v1.3.2.html) | 4,429,185 | 保存到本地后双击打开，内嵌角色、图集与中文字体 |

SHA-256：

```text
22af6832917c5706eed91837edce9418d7171c4013b26a09c30a31da1932b267  Maodou-Coopanion-v1.3.2.zip
6b0cad57f6c6f06e4b50758454d09cf44557123394a2ab0cda288b030d952ca0  Maodou-Offline-Preview-v1.3.2.html
```

ZIP 已通过固定原生导入器的 **10/10** 检查，包括实际临时安装和逐文件读回。离线 HTML 构建检查 **9/9**，并在最终综合浏览器检查中以 `file:` 直接打开；阻断 HTTP/HTTPS 后仍成功加载与绘制，25 个表情和 28 个动作控件完整。本轮没有重新逐项运行全部 53 个词条。

v1.3.2 修复耳根材质接缝与侧转轮廓，补充耳根连接、大幅抬耳、四肢前后层级、交错步态和连续落地恢复。最终综合检查 **24/24**，动作检查 **207/207**，左右 21° 强耳检查各 **35/35**。这些检查的实际范围、有限人工抽样、软件 WebGL 性能数据和原始报告均见 [验收入口](../docs/qa/acceptance.md)；没有将其写成用户设备稳定 60 FPS 或完整 Electron 整机实测保证。

角色包采用 **Coopanion manifest 2 / API 2** 的绘画网格运行格式，包含约 ±75° 的有限转向，不是 Cubism `moc3` / `model3.json` / Editor 工程。GitHub 源码仓库的 “Download ZIP” 是源码归档，不能当作角色包导入。

旧宿主若存在松手后仍跟随鼠标的问题，应同时应用 [host-fix](../host-fix/README.md) 中的指针释放补丁。只更新角色 ZIP 不能补回宿主缺失的释放消息。这里的角色 ZIP 不包含源码归档或参考媒体。
