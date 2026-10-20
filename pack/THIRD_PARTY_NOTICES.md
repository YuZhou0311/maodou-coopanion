# Third-party notices / 第三方与角色权利说明

## Coopanion 与工程代码

本工程复用 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion) 的原生身体、宿主、隔离页面与导入器。固定提交为 `04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33`。复制文件、原始路径和 SHA-256 见 [vendor provenance](https://github.com/YuZhou0311/maodou-coopanion/blob/main/preview-host/vendor/coopanion/provenance.json)，上游附带的完整第三方说明保存在 [vendor THIRD_PARTY_NOTICES.md](https://github.com/YuZhou0311/maodou-coopanion/blob/main/preview-host/vendor/coopanion/THIRD_PARTY_NOTICES.md)。

根目录 [LICENSE](LICENSE) 逐字节复制上游提供的 GNU Affero General Public License v3 正文。工程代码按文件内 SPDX 与该许可证说明提供；原有版权和许可通知应保留。构建工具使用的 esbuild、fflate 等依赖各有其随包许可证，版本由 `preview-host/package-lock.json` 固定；AGPL 不替换这些依赖自身的许可。

## 大耳帽兜、游戏与参考影像

《洛克王国：世界》、大耳帽兜及其原设、名称、商标和官方影像相关权利归各自权利人。本项目为用户自用制作的**非官方重制**，不由游戏官方或 Live2D 官方发布、认可或背书，不冒充其官方资产。

生产绘画来自本轮 GPT 图像模型生成与编辑输出；官方画面仅作为明确标注来源的研究参考。公开可查看、经过 AI 重绘或代码采用 AGPL，都不构成对原角色、商标或参考影像的商用授权。本工程不作这类授权承诺。

参考出处、官方实机与宣传演绎的区别、媒体转载和排除项见 [references/research-notes.md](https://github.com/YuZhou0311/maodou-coopanion/blob/main/references/research-notes.md)。未使用的生成稿与旧失败截图属于过程记录，不代表官方基准或最终成品。

## Live2D 技术参考

Live2D / Cubism 的名称和技术文档属于其相应权利人。工程参考其分层网格动画方法，但运行格式为 Coopanion manifest 2 / API 2。此交付不包含 Cubism Core、`moc3`、Cubism Editor 工程或第三方 Cubism 软件的兼容承诺。
