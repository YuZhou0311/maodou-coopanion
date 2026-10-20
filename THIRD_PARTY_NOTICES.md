# 第三方与角色权利说明

## 工程代码与 Coopanion

本工程复用 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion) 的原生身体、宿主、隔离页面及导入器，固定提交为 `04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33`。复制文件的原路径和 SHA-256 记录于 [vendor provenance](preview-host/vendor/coopanion/provenance.json)，上游通知原文保存在 [vendor THIRD_PARTY_NOTICES.md](preview-host/vendor/coopanion/THIRD_PARTY_NOTICES.md)。

根目录 [LICENSE](LICENSE) 保留上游的 GNU Affero General Public License v3 正文。工程代码按各文件 SPDX 与该许可提供，原版权及许可通知应保留。esbuild、fflate 等依赖继续适用各自许可证，固定版本见 `preview-host/package-lock.json`。

`host-fix/` 另含来自 [YuZhou0311/Coopanion](https://github.com/YuZhou0311/Coopanion) 的 `pet-app.js` 基线及补丁，精确 Git blob、来源路径、基线与补丁哈希见 [host-fix/base.json](host-fix/base.json)。该补丁未替换 `preview-host/vendor/` 中固定的上游源码。

## 角色、美术与研究资料

《洛克王国：世界》、大耳帽兜及其名称、原设、商标和官方影像的权利归相应权利人。本项目是用户授权制作并公开源码的非官方重制，不由游戏官方或 Live2D 官方发布、认可或背书。

`art-source/` 与生产图集中的绘画来自本轮 GPT 图像模型生成或编辑输出。它们参考既有游戏角色；AI 生成、公开发布及工程的 AGPL 许可都不构成原角色、商标或参考影像的商用授权。本项目不作这类授权承诺。

公开仓库只保留第三方研究资料的 URL、出处类别、镜头时间和观察记录，不复制官方、媒体、玩家或社区图片、视频、网页，也不公开用户原始截图。`art-source/user-selected-front.png` 是已选 AI 原图 `front-master-02.png` 的逐字节别名，用于测量脚本，并非用户截图。

未采用的 AI 草稿保留在源码中用于说明制作来源，不因此成为官方设定或批准母版。来源等级见 [references/research-notes.md](references/research-notes.md)。

## 字体

中文预览字体由 Noto Sans CJK SC 派生，使用 SIL Open Font License 1.1。原许可全文位于 [tools/fonts/OFL.txt](tools/fonts/OFL.txt)。修改后的子集使用名称 **Maodou Preview UI**，来源、校验和重建说明见 [字体说明](tools/fonts/README.md)。

## Live2D 技术参考

Live2D / Cubism 名称及技术文档属于相应权利人。工程借鉴分层、网格与参数组织方法，实际格式为 Coopanion manifest 2 / API 2；不包含 Cubism Core、`moc3`、Cubism Editor 工程或第三方 Cubism 软件的兼容承诺。
