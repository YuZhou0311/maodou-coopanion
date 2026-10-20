# v1.3.1 绘画与绑定制作

本工程把生成绘画、技术裁切、网格绑定和真实运行验收分别保存。完整提示词位于 [art-source/prompts.md](../art-source/prompts.md)，公开参考出处见 [研究说明](../references/research-notes.md)。

## 母版与研究边界

用户选择 [front-master-02.png](../art-source/front-master-02.png) 的正面头形作为依据；这不表示用户批准全部侧向、动作或整包。`user-selected-front.png` 与它逐字节相同，是 [耳轮廓测量脚本](../tools/measure-front-ears.py) 使用的 AI 原图别名。用户原始截图不随公开源码发布。

[turnaround-test-03.png](../art-source/turnaround-test-03.png) 从选定母版延伸，研究约 45°、75° 的头侧体积、近耳盖脸和远耳后置。它属于 AI 设计推定，角度不是官方标定的正交测量。隐藏区域由图像模型补全，也不等于取得了官方模型。

## 生产源图

| 文件 | 采用范围 |
| --- | --- |
| `head-skins-04.png` | 三个方向的无五官头皮；颜色与阴影用于 UV，正面几何单独注册 |
| `ear-skins-05.png` | 第一格正面耳；中间错误双耳不使用，旧外耳保留为来源历史 |
| `ear-skins-11-clean-root.png` | 清理根部多余阴影后的外耳；使用范围以 `build-art.py` 登记为准 |
| `body-parts-06-draft.png` | 只采用底排的两爪、两脚与尾巴；上排残留附肢的躯干不使用 |
| `torso-skins-10-clean.png` | v1.3.1 的三方向躯干，AI 修去内部残留手痕；取代旧 07 躯干 |
| `features-08.png` | 眼、眼弧、嘴、额纹、腮红、泪珠，柔边透明度按各自语义保留 |
| `front-master-01.png`、`torso-skins-07.png`、`head-extraction-09-unused.png` | 制作历史，不作为当前批准的完整形体；09 的位置比例改变，因此未采用 |

原始生成 PNG 保留完整分辨率。正式源选区以 [tools/build-art.py](../tools/build-art.py) 与 [pack/art-data.json](../pack/art-data.json) 为准，文件名有 `draft` 不意味着其中选用的四肢无效，也不意味着整张都采用。

## 技术裁切与图集

图集脚本限定已画选区，选择连通 alpha 主体，清除背景碎片，按部件类型做边缘 alpha 清理，然后裁切、留透明 gutter、登记纹理坐标与 96 行轮廓样本。它不重画原 RGB，不用程序椭圆或新画的矢量五官替代已选绘画。腮红的透明渐变和细小五官笔画使用较轻处理。

当前资产由 25 个独立切件进入 2048×2048 图集。完整元数据包括源图、原选区、trim、atlas rect、采样边界及源哈希；实际状态以生成记录为准。

```sh
python tools/build-art.py
node tools/build-model.mjs
node preview-host/stage-pack.mjs
```

上述步骤依次覆盖切件/图集、模型、staging。需要手工编辑时先另存副本，再决定修改哪一层输入；直接改派生 PNG 后重跑会被覆盖。普通运行和安装包构建使用仓库已提供的 PNG，不需要重新生图。

## 形体、姿态与外轮廓

正面网格 XY 与头皮 UV 分开：XY 由选定母版测量和注册控制，UV 采样已绘白面与阴影。v1.3.1 将头高收短约 3.5%，以下颊为锚，五官和耳根跟随注册关系，避免整张头皮矩形比例重新定义角色。

方向关键形状共同改变头、身体、耳面和五官透视。近耳的白色外面实际位于同侧脸颊与肩前，远耳处于后方。整耳抬起/展开和中下段弯曲、耳尖延迟分别驱动；四肢接入原生步态。连接根部留隐藏重叠，整体外轮廓在部件合成之后生成，避免每块部件各自出现拼接硬边。

表情使用位图特征混合与姿态组合，共 25 个表达词；说话脉冲叠加在嘴形上。二维图层、网格与遮挡支持有限方向的连续转向，并非完整 360° 三维模型。

## 技术参考与验收

制作参考 Live2D 官方的 [ArtMesh](https://docs.live2d.com/en/cubism-editor-manual/concept-of-artmesh/)、[手动编辑网格](https://docs.live2d.com/en/cubism-editor-manual/mesh-edit-manual/)、[纹理图集](https://docs.live2d.com/en/cubism-editor-manual/texture-atlas-edit/) 与 [Deformer](https://docs.live2d.com/en/cubism-editor-manual/deformer/) 思路。实际输出仍是 Coopanion JavaScript API 2，没有 Cubism Core、`moc3` 或 Cubism 编辑工程。

alpha 检查、几何边界和绘制调用数不能代替画面判断；正面、侧面、抬耳、抱耳和转向中间帧仍需真实运行验证。最终的视觉、指针和性能范围见 [验收入口](qa/acceptance.md)，不把历史阶段的通过数字重标为当前版本。
