# 固定的 Coopanion 原生宿主源码

源仓库：[Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion/tree/04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33/packages/cortico-world-desktop-pet/web)。固定提交 `04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33`。

`provenance.json` 逐项记录来源路径、字节数和 SHA-256。`web/` 中的宿主、隔离 frame、kit 以及中英文语言文件逐字节复制，未作补丁。预览服务按原生 CSP 和 CORS 方式提供这些文件。项目适配逻辑位于项目自身的 `runtime/host-adapter.js`。

`src/` 保留原始 `packs.ts`、`pack-import.ts` 及其实际脚本与语言依赖。`preview-host/native-importer.mjs` 用固定 esbuild 编译这些原文件，再调用原生 `readManifest`、`filesFromZip`、`PackImporter.stage/install`；没有重写校验函数或以桩替代其依赖。安装验收只写工程内的临时目录，不写用户的 Coopanion 安装位置。

适用许可见 [LICENSE](LICENSE)。[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 是上游包附带的通知。此目录不包含 whale 的角色贴图、模型或声音，不随可直接导入的角色 ZIP 重复分发；源码预览工程保留这些固定宿主文件以复现接入环境。
