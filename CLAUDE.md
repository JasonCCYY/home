# Claude Code 設定

## 部署方式

- 直接 push 到 `main` branch，Vercel 會自動部署到正式環境
- **不需要**建立 feature branch 或 PR，直接 commit 到 `main`
- Push 指令：`git push -u origin main`

## 專案結構

- `home/` — 主要 app（支出/收入管理）
- `family/` — 家庭 app
- `api/` — Vercel serverless functions
- `vercel.json` — 路由設定（靜態檔案，無 build 步驟）
