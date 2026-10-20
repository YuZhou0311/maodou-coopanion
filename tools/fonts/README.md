# 中文预览字体

日常源码预览与离线 HTML 使用已提供的 `MaodouPreviewUI.woff2`，无需系统安装中文字体或联网。该字体是 Noto Sans CJK SC 的定向子集，改用名称 **Maodou Preview UI**；原许可见 [OFL.txt](OFL.txt)，生成记录见 [MaodouPreviewUI.json](MaodouPreviewUI.json)。

## 可选：获取原字体与重建

完整 OTF 约 16 MB，公开源码不重复提交。需要重新生成子集或 PNG 交付图册时，在工程根目录执行：

```sh
python tools/fetch-preview-font.py
python tools/build-preview-font.py
```

获取脚本下载公开的 [Noto Sans CJK SC Regular](https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf)，校验 SHA-256 为：

```text
2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b
```

只有完全匹配才写入 `tools/fonts/NotoSansCJKsc-Regular.otf`。若上游后来更改文件，脚本会拒绝替换，避免无提示地生成不同字形；可从 Noto 官方源码历史取得相同版本后放入此路径，再执行 `--check`。

`build-preview-font.py` 扫描预览 HTML/JS、角色清单及常用 ASCII，使用 fontTools 子集化并保留 OFL 所需通知。当前脚本可使用 Python Brotli 或 Node.js 24 的 Brotli 作为压缩实现。新增界面文案后，应重新生成子集，再重建 staging/离线 HTML，并实际检查中文显示。

```sh
python tools/fetch-preview-font.py --check
```

这个选项只核验本地原字体，不联网。完整字体和子集均保留其原有许可范围；派生子集名称不沿用保留字体名称。
