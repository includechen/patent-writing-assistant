<p align="center">
  <img src="docs/images/app-icon.svg" width="88" alt="专利撰写助手"/>
</p>

<h1 align="center">基于专利 Skill 设计的 AI 专利撰写助手</h1>

<p align="center">
  <strong>Windows 桌面智能体 · 专利全流程交付 · 技术咨询 · 单独查重 · 多模态对话</strong>
</p>

<p align="center">
  <a href="https://gitee.com/quanzhouuniversity/patent-writing-assistant"><img src="https://gitee.com/quanzhouuniversity/patent-writing-assistant/badge/star.svg?theme=dark" alt="Gitee star"/></a>
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="GPL-3.0"/>
  <img src="https://img.shields.io/badge/version-1.3.13-green.svg" alt="v1.3.13"/>
</p>

<p align="center">
  <a href="README.en.md">English</a> ·
  <a href="https://gitee.com/quanzhouuniversity/patent-writing-assistant">Gitee 仓库</a> ·
  <a href="release/">本地下载安装包</a> ·
  <a href="https://gitee.com/quanzhouuniversity/patent-writing-assistant/releases">Gitee Releases</a> ·
  作者 <strong>陈兴华</strong> · <a href="mailto:13960565525@163.com">13960565525@163.com</a>
</p>

---

## 介绍

**专利撰写助手**是一款面向研发、法务、知识产权岗位的 **Windows 桌面 AI 智能体**。它既内置标准化 **专利撰写 Skill**（Phase 1～6 一键出交底书、流程图、Word），也具备市面上通用智能体的全部基础能力：**技术方案解答、创新点头脑风暴、单独联网查重、多轮咨询修改、闲聊陪伴**——全部在类 Cursor 的对话界面中完成。

> **一句话定位**：写专利时它是「流水线工程师」；不写专利时它是「技术顾问 + 检索助手 + 聊天伙伴」。

### 能力全景

同一对话窗口，**智能识别意图**，无需切换模式：

| 能力类型 | 触发方式（示例） | 行为 |
|----------|------------------|------|
| **完整专利撰写** | 「帮我撰写…发明专利」「按 Skill 输出完整交底书」 | 执行 Phase 1～6，生成 MD / 流程图 / Word |
| **技术咨询** | 「这个方案新颖性如何？」「帮我优化发明点」 | 多轮对话分析，不自动跑流水线 |
| **技术方案解答** | 「解释一下这几个步骤的架构设计」+ 附图 | 结合附件与历史上下文深度解读 |
| **创新头脑风暴** | 「Android 显示方面有什么专利想法？」 | 给出热点方向、机会点与布局建议 |
| **单独查重** | 「帮我查重：一种基于…的方法」 | 联网检索 ≥12 平台 + Phase 3.6 关键词重合分析 |
| **检索能力咨询** | 「支持哪些查重网站？」 | 列出平台清单与使用说明 |
| **仅导出 Word** | 「重新导出 Word」「导出最新交底书」 | 基于已有文稿触发 Phase 6 |
| **身份 / 能力问答** | 「你是什么工具？能帮我做什么？」 | 介绍能力边界与适用人群 |
| **日常闲聊** | 「写专利累了，讲个笑话」 | 轻松对话，不触发专利流水线 |
| **随机示例专利** | 「随机生成一个专利」 | 演示完整 Skill 流水线能力 |

### 为什么要用本工具？

| 对比 | 通用 AI 网页 / Cursor | 本工具 |
|------|----------------------|--------|
| 专利交付 | 自由文本，需人工排版 | **八节交底书 + 企业 Word 模板 + 图纸嵌图** |
| 查重检索 | 需自行搜索、自行判断 | **单独查重指令 + ≥12 平台链接 + 关键词重合门禁** |
| 使用场景 | 仅对话 | **对话 + 产物管理 + 一键打开 Word / 定位文件夹** |
| 数据与隐私 | 多依赖云端账号 | **本地桌面**，配置与产出在 `%APPDATA%\patent-assistant\` |
| 模型 | 绑定单一产品 | **自配 OpenAI 兼容 API**，AUTO 按任务选 Vision / 推理 / 快速模型 |
| 附件 | 部分支持 | **图片、日志、PDF、Word、压缩包** 统一解析与路由 |

### 核心特色与优势

**专利专业能力**

1. **专利 Skill 流水线** — Phase 1～6 标准化撰写，非单次 Prompt 碰运气  
2. **企业 Word 模板** — 自动填表，流程图嵌入 **「图纸」** 栏位  
3. **查重双轨** — 撰写流程内 Phase 3.6 门禁 + **对话内单独查重**  
4. **多平台检索** — Google Patents、EPO、国知局 PSS、SooPat、Lens 等 **≥12 个入口**  
5. **P0 自评与检索报告** — 三性评估、白盒分析、检索链接汇总  

**通用智能体能力**

6. **技术深度解答** — 架构、步骤、算法均可结合附图多轮追问  
7. **创新方向建议** — 行业热点、专利机会、布局策略  
8. **多轮方案打磨** — 在已有交底书基础上咨询修改，无需重写全文  
9. **自然闲聊** — 工作间隙轻松对话，同一界面无缝切换  

**工程与体验**

10. **AUTO 多模型路由** — 含图 / 日志 / 长文 / 专利 / 闲聊 自动选模  
11. **历史会话** — 搜索、续聊、后台执行，切换页面不中断  
12. **输出产物面板** — Word / MD / 流程图分类浏览，打开与定位  
13. **三类主题 + 中英双语** — 午夜深蓝 / 石墨深灰 / 日光浅色  
14. **一键依赖修复** — Node、mermaid-cli、Pandoc、Word 模板  
15. **本地优先** — API Key 仅存本机，LLM 走自配网关，无作者服务器中转  

---

## 界面与能力预览

以下为 **v1.3.13 真实运行截图**（[`docs/images/`](docs/images/)）。

### 通用智能体：不止写专利

**工具介绍 · 能力边界 · 适用人群**

<table align="center" width="100%">
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/18-chat-who-are-you.png" width="440" alt="你是什么工具"/>
      <br/><em>「你是什么工具？」— 专利撰写、分析优化、专业咨询、互动问答四大能力</em>
    </td>
    <td align="center" width="50%">
      <img src="docs/images/19-chat-capabilities-full.png" width="440" alt="能力边界"/>
      <br/><em>能力边界说明 + 研发工程师 / 专利代理 / 企业 IP / 科研人员等适用人群</em>
    </td>
  </tr>
</table>

**技术解答 · 创新想法 · 轻松闲聊**

<table align="center" width="100%">
  <tr>
    <td align="center" width="33%">
      <img src="docs/images/15-chat-tech-explain.png" width="280" alt="技术步骤解答"/>
      <br/><em>结合流程图截图，逐步讲解技术实现</em>
    </td>
    <td align="center" width="33%">
      <img src="docs/images/16-chat-architecture-analysis.png" width="280" alt="架构深度分析"/>
      <br/><em>架构分层、算法细节、模块职责深度解读</em>
    </td>
    <td align="center" width="33%">
      <img src="docs/images/17-chat-casual-joke.png" width="280" alt="日常闲聊"/>
      <br/><em>工作间隙闲聊陪伴，同一窗口随时切换</em>
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/images/01-main-chat.png" alt="创新想法与行业分析" width="920"/>
</p>
<p align="center"><em>「Android 显示相关专利有什么想法？」— 热点领域、专利机会、布局建议（无需触发完整撰写）</em></p>

### 专利撰写：Skill 流水线

<table align="center" width="100%">
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/02-chat-phase-writing.png" width="440" alt="Phase 撰写进度"/>
      <br/><em>Phase 1～6 执行：检索、查重、Word 导出进度实时可见</em>
    </td>
    <td align="center" width="50%">
      <img src="docs/images/03-chat-disclosure-md.png" width="440" alt="交底书 Markdown"/>
      <br/><em>对话内预览八节交底书 Markdown</em>
    </td>
  </tr>
</table>

### 设置 · 说明 · 反馈

<table align="center" width="100%">
  <tr>
    <td align="center" width="33%">
      <img src="docs/images/04-settings-export.png" width="280" alt="导出环境"/>
      <br/><em>导出环境检测与一键修复</em>
    </td>
    <td align="center" width="33%">
      <img src="docs/images/05-settings-llm.png" width="280" alt="LLM 配置"/>
      <br/><em>自配 API / 模型 / AUTO 路由</em>
    </td>
    <td align="center" width="33%">
      <img src="docs/images/06-guide.png" width="280" alt="使用说明"/>
      <br/><em>应用内完整指南</em>
    </td>
  </tr>
</table>

### 输出产物管理

<table align="center" width="100%">
  <tr>
    <td align="center" width="33%">
      <img src="docs/images/08-output-word-list.png" width="280" alt="Word 列表"/>
      <br/><em>Word 交付件 · 打开 / 定位</em>
    </td>
    <td align="center" width="33%">
      <img src="docs/images/09-output-md-list.png" width="280" alt="MD 列表"/>
      <br/><em>Markdown 全文</em>
    </td>
    <td align="center" width="33%">
      <img src="docs/images/10-output-flowchart-list.png" width="280" alt="流程图列表"/>
      <br/><em>流程图 PNG / Word 嵌图 JPG</em>
    </td>
  </tr>
</table>

### 生成成果示例

真实案例：**「一种基于预测算法的触摸事件预处理与智能分发优化方法」**

| 产物 | 路径 |
|------|------|
| Markdown | [`sample-touch-disclosure.md`](docs/images/sample-touch-disclosure.md) |
| Word | [`sample-touch-disclosure.docx`](docs/images/sample-touch-disclosure.docx) |
| 流程图 | [`sample-touch-flowchart.jpg`](docs/images/sample-touch-flowchart.jpg) |

<p align="center">
  <img src="docs/images/sample-touch-flowchart.jpg" alt="流程图" width="400"/>
</p>

**Word 技术交底书（WPS / Microsoft Word）：**

<table align="center" width="100%">
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/11-word-terms-background.png" width="440" alt="技术术语"/>
      <br/><em>技术术语 · 背景技术</em>
    </td>
    <td align="center" width="50%">
      <img src="docs/images/12-word-tech-solution.png" width="440" alt="技术方案"/>
      <br/><em>技术方案 · 有益效果</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/13-word-invention-points.png" width="440" alt="发明点"/>
      <br/><em>发明点 · 保护范围要点</em>
    </td>
    <td align="center" width="50%">
      <img src="docs/images/08-word-drawing.png" width="440" alt="图纸栏"/>
      <br/><em><strong>「图纸」</strong> 栏自动嵌入流程图</em>
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/images/14-word-drawing-page.png" alt="图纸页全貌" width="720"/>
</p>

更多精简片段见 [`docs/samples/`](docs/samples/)。

---

## 软件架构

```
┌─────────────────────────────────────────────────────────────┐
│  Electron 桌面壳（窗口 / 菜单 / 托盘 / 自动更新）              │
│  内嵌 Express API  127.0.0.1:3847（仅本机）                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  React 前端                                                  │
│  专利对话 │ 优化建议 │ 使用说明 │ 设置                         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  意图路由 + 专利 Skill（server/patent）                        │
│  chat / consult / prior_art_search / patent_draft / export  │
│  LLM 路由 │ 附件解析 │ SQLite 对话存储                         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  本地数据  %APPDATA%\patent-assistant\                        │
│  .env │ llm-models.json │ data/outputs/ │ skill/             │
└─────────────────────────────────────────────────────────────┘
```

| 层次 | 技术 |
|------|------|
| 桌面 | Electron 34 |
| 前端 | React 18 + Vite |
| 后端 | Express + better-sqlite3 |
| 导出 | mermaid-cli + Pandoc + PowerShell + Microsoft Word |
| 更新 | Gitee `latest.yml` + Release 安装包 |

**专利 Skill 阶段：**

| 阶段 | 作用 |
|------|------|
| Phase 1～5 | LLM 撰写交底书八节与说明书 |
| Phase 2b | Mermaid → PNG 流程图 |
| Phase 3 / 3.5 | OpenAlex、Crossref、Google Patents 等检索 |
| Phase 3.6 | 查重门禁（关键词重合过高可阻断 Word 交付） |
| Phase 6 | 厂商 Word 模板填表 + 嵌入图纸 |

---

## 安装教程

### 环境要求

| 项目 | 要求 |
|------|------|
| 系统 | Windows 10 / 11，**64 位** |
| Word | **Microsoft Word**（Phase 6 导出必需） |
| 网络 | LLM 调用、查重检索、依赖下载 |
| LLM | 任意 **OpenAI 兼容** HTTP API |

### 下载安装

| 来源 | 说明 |
|------|------|
| [`release/`](release/) | 克隆仓库后，安装包在仓库内的 **`release/PatentAssistant-Setup-1.3.13.exe`** |
| [Gitee Releases](https://gitee.com/quanzhouuniversity/patent-writing-assistant/releases) | 未克隆仓库时，在发行版附件中下载同名 exe |

1. 下载 `PatentAssistant-Setup-1.3.13.exe` 并双击安装  
2. SmartScreen 提示时选 **更多信息 → 仍要运行**  
3. 默认安装到：`%LOCALAPPDATA%\Programs\patent-assistant\`（即 `C:\Users\<用户名>\AppData\Local\Programs\patent-assistant\`）  
4. 从开始菜单启动 **专利撰写助手**（或运行上述目录中的 `patent-assistant.exe`）

### 路径速查（找不到文件时看这里）

| 用途 | 路径 | 说明 |
|------|------|------|
| **安装包（未安装前）** | 仓库 [`release/PatentAssistant-Setup-1.3.13.exe`](release/PatentAssistant-Setup-1.3.13.exe) | `git clone` 后进入项目根目录，打开 `release` 文件夹即可 |
| **安装包（在线）** | [Gitee Releases 附件](https://gitee.com/quanzhouuniversity/patent-writing-assistant/releases) | 选择 **v1.3.13**（或最新）发行版，下载 `PatentAssistant-Setup-*.exe` |
| **已安装程序** | `%LOCALAPPDATA%\Programs\patent-assistant\` | 主程序：`patent-assistant.exe` |
| **生成产物（Word / MD / 流程图）** | `%APPDATA%\patent-assistant\data\outputs\` | 例：`C:\Users\<用户名>\AppData\Roaming\patent-assistant\data\outputs\` |
| **配置与数据** | `%APPDATA%\patent-assistant\` | `.env`（API Key）、`llm-models.json`、对话数据库等 |

**应用内快捷打开（推荐）：**

- 专利对话 → 右侧 **输出产物** → **打开目录** / 单文件 **打开**、**定位**  
- 专利对话顶部 → **打开最新 Word** / **在文件夹中显示**

> 若在资源管理器地址栏粘贴路径，请将 `<用户名>` 换成你的 Windows 登录名，或直接在资源管理器地址栏输入 `%APPDATA%\patent-assistant\data\outputs` 后回车。

### 首次配置（约 10 分钟）

```
① ⚙️ 设置 → 导出环境 → 「一键安装 / 修复依赖」
② ⚙️ 设置 → LLM API → 填写 Base URL、Key，添加模型，勾选 AUTO，保存
③ 💬 专利对话 → 试用咨询、查重或撰写
④ 正式撰写后 → 右侧输出产物 → 打开 .docx 验证「图纸」
```

| LLM 字段 | 示例 |
|----------|------|
| API Base URL | `https://api.openai.com/v1` |
| API Key | 在服务商控制台获取 |
| 可用模型 | `gpt-4o-mini`、`deepseek-chat` 等 |

> 未配置 Key 时可浏览界面与演示模板；正式使用须完成 LLM 配置。

### 更新

- **应用内**：设置 → 立即检查更新  
- **手动**：[Gitee Releases](https://gitee.com/quanzhouuniversity/patent-writing-assistant/releases) 或替换 `release/` 中安装包  

更新源：`https://gitee.com/quanzhouuniversity/patent-writing-assistant`

---

## 使用说明

### 侧边栏

| 入口 | 功能 |
|------|------|
| 💬 **专利对话** | 主工作区：咨询、查重、撰写、闲聊、产物管理 |
| 💡 **优化建议** | 问题 / 建议 / 功能需求，可 SMTP 邮件反馈 |
| 📖 **使用说明** | 应用内操作指南 |
| ⚙️ **设置** | 语言、更新、导出环境、LLM、SMTP |

### 场景示例

**① 完整专利撰写**

```
帮我撰写一种基于预测算法的触摸事件预处理与智能分发优化方法的发明专利。

技术要点：InputDispatcher 智能分发；TouchEvent 预处理与预测算法；
优先级队列；降低 Touch Latency。
```

**② 单独查重（不撰写全文）**

```
帮我查重：一种基于预测算法的触摸事件预处理与智能分发优化方法，
包括事件缓冲区、预测模型、优先级队列与智能分发模块。
```

**③ 技术咨询 / 创新想法**

```
你对 Android 显示相关方面的专利有什么想法？
```

```
解释一下流程图中「预测置信度是否高于阈值」这一步的架构设计。
```
（可附图 📎）

**④ 日常闲聊**

```
写专利有点累了，你给我讲个笑话吧。
```

### 操作技巧

- **Enter** 发送，**Shift+Enter** 换行  
- 📎 支持图片、日志、PDF、Word、压缩包  
- 模型推荐 **AUTO**；生成中可切换页面，**后台继续**  
- 顶部 **打开最新 Word** / **在文件夹中显示** 快速访问产物  

### 输出文件

默认目录：**`%APPDATA%\patent-assistant\data\outputs\`**（完整路径见上文 [路径速查](#路径速查找不到文件时看这里)）

| 文件 | 说明 |
|------|------|
| `专利_<名称>_技术交底书与说明书.md` | 完整 Markdown |
| `专利_<名称>_…_章节提取.json` | 结构化章节 |
| `<名称>_flowchart.mmd` / `.png` | 流程图源码与图片 |
| `专利_<名称>_技术交底书与说明书.docx` | Word 交付件 |

### 常见问题

| 问题 | 处理 |
|------|------|
| Word 无流程图 | 设置 → 修复依赖；确认 Word 已安装 |
| 只有 md 无 docx | 导出环境未就绪或未跑到 Phase 6 |
| 查重被阻断 | 提高方案差异化后重新撰写或单独查重评估 |
| 模型列表为空 | 设置 → 添加「可用模型」并保存 |
| 只想聊天却触发了撰写 | 缩短描述、加问号，或明确说「先聊聊不写交底书」 |
| 找不到安装包或产物 | 见 [路径速查](#路径速查找不到文件时看这里)；或在应用内点「打开目录」 |

---

## 参与贡献

1. **Fork** [patent-writing-assistant](https://gitee.com/quanzhouuniversity/patent-writing-assistant)  
2. 新建 `Feat_xxx` 分支  
3. 提交代码（遵循 **GPL-3.0**）  
4. 新建 Pull Request  

**联系**： [13960565525@163.com](mailto:13960565525@163.com) · 应用内 **💡 优化建议**

---

## 特技

| # | 能力 | 说明 |
|---|------|------|
| 1 | **双模智能体** | 专利 Skill 流水线 + 通用咨询 / 闲聊 / 查重，意图自动识别 |
| 2 | **八节交底书 + Word 模板** | 章节与厂商表格一致，图纸自动嵌图 |
| 3 | **单独查重** | 对话内一条指令完成多平台检索与重合分析 |
| 4 | **≥12 检索平台** | Google Patents、EPO、PSS、SooPat、Lens 等 |
| 5 | **查重门禁** | Phase 3.6 高重合可阻断 Word 交付 |
| 6 | **AUTO 多模型路由** | Vision / 推理 / 快速模型按任务切换 |
| 7 | **多模态附件** | 图片、日志、PDF、Word、压缩包 |
| 8 | **产物面板** | Word / MD / 图片分类管理 |
| 9 | **本地桌面 + 自配 LLM** | 无 SaaS 绑定，支持内网网关 |
| 10 | **三主题 + 双语** | 深 / 浅主题，中 / En 界面 |
| 11 | **一键依赖修复** | Node、mermaid-cli、Pandoc、模板 |
| 12 | **自动更新** | Gitee `latest.yml` + Release |

---

## 从源码构建

```powershell
git clone https://gitee.com/quanzhouuniversity/patent-writing-assistant.git
cd patent-desktop
npm install
npm run dev          # 开发模式
npm run build        # 构建安装包 → dist\
```

构建完成后，安装包可复制到 [`release/`](release/) 目录供分发。维护者发布流程见 [`build/PUBLISH.md`](build/PUBLISH.md)。

---

## 若对您有所帮助

本工具开源免费，持续维护不易。若它在您的专利撰写、技术调研或日常咨询中**确实帮到了您**，可以考虑：

- 给 [Gitee 仓库](https://gitee.com/quanzhouuniversity/patent-writing-assistant) 点个 **Star**，方便更多同行发现、使用与反馈  
- **随缘**向作者支付宝 **`13960565525`** 打赏一点茶水费（金额随意，完全自愿；不打赏也不影响任何功能）

您的 Star 与反馈，比打赏更让作者有动力继续迭代。感谢使用。

---

## 版权

Copyright © 2026 **陈兴华** &lt;13960565525@163.com&gt;

本软件采用 **[GNU General Public License v3.0（GPL-3.0）](LICENSE)** 发布，与 [Gitee 仓库](https://gitee.com/quanzhouuniversity/patent-writing-assistant) 一致。

<p align="center">
  <strong>基于专利 Skill 设计的 AI 专利撰写助手</strong><br/>
  Patent Assistant Desktop · v1.3.13
</p>
