# 专利撰写助手 — 品牌图标

## 设计说明

- **主色**：靛蓝 → 蓝色渐变（`#4f46e5` → `#3b82f6`），与应用 midnight 主题一致
- **图形**：白色文档 + 折角 + 文本线条，象征专利文稿
- **点缀**：翡翠绿羽毛笔与 AI 星芒（`#10b981`），象征智能撰写

## 文件清单

| 文件 | 用途 |
|------|------|
| `icon.svg` | 矢量源文件，可无损缩放 |
| `icon-source.png` | AI 生成原图（裁切前） |
| `icon-1024.png` | 应用商店 / 宣传用高清图 |
| `icon-512.png` | 中等尺寸 PNG |
| `icon-256.png` | 窗口/侧栏 logo |
| `icon-128.png` | 小尺寸 PNG |
| `icon-64.png` | Favicon |
| `../icon.ico` | Windows 安装包与任务栏图标（多尺寸 ICO） |

## 重新生成 ICO

```powershell
cd patent-desktop
powershell -File build/brand/make-icons.ps1 -Source build/brand/icon-source.png
node --input-type=module -e "import fs from 'fs'; import pngToIco from 'png-to-ico'; const buf = await pngToIco(['build/brand/icon-1024.png','build/brand/icon-256.png','build/brand/icon-128.png','build/brand/icon-64.png']); fs.writeFileSync('build/icon.ico', buf);"
```
