# 管理员：桌面版发布说明（开发用）

用户可见说明见 `build/releases-README.md`。

## 更新源（客户端）

| 用途 | URL |
|------|-----|
| **应用内自动更新**（`latest.yml`） | `https://gitee.com/quanzhouuniversity/patent-writing-assistant/raw/master` |
| **浏览器下载**（安装包） | `https://gitee.com/quanzhouuniversity/patent-writing-assistant/releases` |
| **仓库首页** | `https://gitee.com/quanzhouuniversity/patent-writing-assistant` |

配置位置：`server/src/updateSources.cjs`、`config/update.json`。用户 `.env` 中 `PATENT_UPDATE_URL` 可覆盖主源。

旧地址（`patent-draft-android` / `desktop-releases`）会在启动时自动迁移到新仓库。

## 为什么 exe 走 Gitee Release

Gitee raw 对 **>10MB** 文件匿名下载易 403。安装包约 80MB，须作为 **发行版附件** 上传；git 仓库根目录只提交 `latest.yml` + `README.md`。

## 本地发布目录

构建完成后将安装包放入仓库根目录 **`release/`**（供克隆用户直接安装）：

```powershell
cd patent-desktop
npm run build:client && npm run build:icons
npx electron-builder --win --x64 --config.directories.output=dist-build
Copy-Item dist-build\PatentAssistant-Setup-*.exe, dist-build\*.blockmap, dist-build\latest.yml release\ -Force
```

## 发布命令

```powershell
$env:GITEE_TOKEN = 'your-token'
cd patent-desktop
npm run build:release
npm run publish:gitee
```

脚本会：创建发行版 `v{version}`、上传 exe、验证下载 URL、改写 `latest.yml`、push 到 `patent-writing-assistant` 仓库根目录。

无 Token 时：先在 Gitee 网页创建发行版并上传 exe，再：

```powershell
npm run publish:gitee -SkipGiteeRelease
```
