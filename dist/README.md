# 可直接使用的文件 · v1.3.1

两个文件均来自最终冻结源码，已实际读回验证。

| 文件 | 字节数 | 用途 |
| --- | ---: | --- |
| [Maodou-Coopanion-v1.3.1.zip](Maodou-Coopanion-v1.3.1.zip) | 2,564,459 | Coopanion「装扮 → 形象 → 导入」使用的角色包 |
| [Maodou-Offline-Preview-v1.3.1.html](Maodou-Offline-Preview-v1.3.1.html) | 4,411,991 | 保存到本地后双击打开，内嵌角色、图集与中文字体 |

SHA-256：

```text
27e54fa30dcd2d66e0153f0757b6bf6e0df04cd1a815ffe5ab8468fb50591a23  Maodou-Coopanion-v1.3.1.zip
b89a7470bbb8d5b576647555f88cd5d8b61e5568183b3353c094adb06c9c5bc6  Maodou-Offline-Preview-v1.3.1.html
```

ZIP 通过固定原生导入器的 10 项检查；离线 HTML 以 `file:` 直接打开并阻断 HTTP/HTTPS，仍成功加载与绘制。范围见 [验收入口](../docs/qa/acceptance.md)。

GitHub 源码仓库的 “Download ZIP” 是源码归档，不能当作角色包导入。修复旧宿主松手后仍跟随鼠标的问题时，应同时应用 [host-fix](../host-fix/README.md)。这里不包含源码 ZIP 或参考媒体。
