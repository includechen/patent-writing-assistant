# 专利撰写助手 v1.3.13 — 安装包

<p align="center">
  <img src="../docs/images/app-icon.svg" width="72" alt="图标"/>
</p>

## 下载安装

**本目录即为安装包所在位置**（克隆仓库后：`patent-desktop/release/PatentAssistant-Setup-1.3.13.exe`）。

双击 **`PatentAssistant-Setup-1.3.13.exe`** 安装（Windows 10/11 64 位）。安装后程序位于 `%LOCALAPPDATA%\Programs\patent-assistant\`；生成的 Word / MD / 流程图在 `%APPDATA%\patent-assistant\data\outputs\`（应用内「输出产物 → 打开目录」可一键打开）。

| 文件 | 说明 |
|------|------|
| `PatentAssistant-Setup-1.3.13.exe` | NSIS 安装程序（约 80 MB） |
| `PatentAssistant-Setup-1.3.13.exe.blockmap` | 增量更新块映射 |
| `latest.yml` | 应用内自动更新清单 |

## 快速开始

1. **设置 → 导出环境** → 一键安装依赖  
2. **设置 → LLM API** → 配置 API 与模型  
3. **专利对话** → 咨询 / 查重 / 撰写 → 右侧打开 Word  

<p align="center">
  <img src="../docs/images/01-main-chat.png" width="720" alt="主界面"/>
</p>

完整功能说明见仓库根目录 **[README.md](../README.md)**。

## 更新

- **应用内**：设置 → 立即检查更新  
- **手动**：[Gitee Releases](https://gitee.com/quanzhouuniversity/patent-writing-assistant/releases) 下载新版覆盖安装  

---

**作者**：陈兴华 · [13960565525@163.com](mailto:13960565525@163.com)  
**协议**：[GPL-3.0](../LICENSE)
