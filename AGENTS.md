# Agent 协作与开发规范指南 (AGENTS.md)

本项目为个人博客系统 **YuBlog**（Dual 二开定制版，线上主站：https://yugold.top），由前端 Next.js 与后端 Node.js (Express) 构成。所有 AI Agent（包括 Antigravity、Claude Code、Cursor 等）在协助开发时**必须严格遵守以下准则**：

---

## 一、构建与部署铁律（最高优先级，严禁违反）

1. **绝对严禁在远端 VPS 上执行任何构建打包命令**：
   - **禁止行为**：严禁在生产 VPS（通过 SSH）上运行 `pnpm build`、`npm run build`、`next build`、`tsc` 等高负载编译命令！
   - **技术背景**：生产 VPS 规格为 **1 核 vCPU / 1 GiB 内存**（ARM64）。在其上构建 Next.js 极度消耗内存与 CPU，会导致系统频繁读写 Swap、I/O 假死甚至触发 OOM 崩溃，严重威胁线上 `yugold.top` 正常访问，且极度浪费服务器资源。
2. **构建的唯二允许途径**：
   - **本地机器构建**：在本机高性能 CPU 与充裕内存环境下完成构建与验证，打包后再将产物同步至服务器。
   - **GitHub Actions 云端 CI/CD 构建**：通过 GitHub 云端 runner 完成自动构建测试与发布。
3. **开发节奏与交付准则**：
   - **本地优先、闭环验证**：所有的功能开发、UI 优化、性能排查、BUG 修复，必须先在**本地开发环境**（前端 `http://localhost:3000`、后端 `http://localhost:4000`）完成代码编写、类型检查与自测。
   - **严禁擅自提前发布**：在本地任务未彻底做完、未经用户明确要求发布之前，**绝不急于向远端生产环境推送或触发部署**。

---

## 二、安全与防泄露准则

1. **严禁将含明文密码/私钥的文件推送到 Git 仓库**：
   - 本项目包含生产实录 `项目部署情况.md`、部署脚本 `deploy-now.sh`、`deploy-vps.sh`、测试脚本 `test-db.js`、私钥文件 `*.pem` 以及临时缓存 `.workbuddy-ai/`。
   - 上述文件全部包含真实数据库密码、JWT Token、R2 密钥或 SSL 私钥，必须严格保持在 `.gitignore` 忽略列表中，**严禁使用 `git add -f` 强行加入或意外提交**。

---

## 三、性能与媒体规范

1. **大图全站自动压缩**：
   - 媒体文件直传 Cloudflare R2，后端不经手图片字节流。
   - 前端必须在浏览器端通过 `frontend/src/lib/image-compress.ts` 完成智能无感等比缩放（默认上限 2048px）并转为高压缩率的 WebP 格式再上传，绝不可将 5MB+ 原始相机大图直接推到 R2。
2. **Next.js 版本特性注意**：
   - 前端采用 Next.js 16+ / React 19，路由与服务端组件有诸多全新约定，遵循 `frontend/node_modules/next/dist/docs/` 规范，避免引入已废弃的旧版本写法。

---

## 四、标准构建、发布与远端同步部署 SOP（严禁跳步）

当用户要求“构建、提交 GitHub、同步部署”时，必须严格执行以下标准流水线：

1. **本地编译构建（甲骨文 or4 高性能环境）**：
   ```bash
   # 后端构建（编译为 dist/）
   cd backend && pnpm build && cd ..

   # 前端构建（Standalone 独立输出模式，并拷贝静态资源）
   cd frontend && pnpm build
   cp -r .next/static .next/standalone/.next/static
   cp -r public .next/standalone/public
   cd ..
   ```

2. **Git 提交并推送至 GitHub**：
   ```bash
   git add .
   git commit -m "feat/fix: 详细更新说明"
   git push origin master
   ```

3. **远端 VPS 同步与产物分发（目标主机: ci / /opt/kanle）**：
   ```bash
   # 1. 远端同步 Git 仓库保持一致
   ssh ci "cd /opt/kanle && git pull origin master"

   # 2. 同步后端编译产物
   rsync -avz backend/dist/ ci:/opt/kanle/backend/dist/

   # 3. 同步前端独立产物与公共静态资产
   rsync -avz --exclude node_modules frontend/.next/standalone/ ci:/opt/kanle/frontend/.next/standalone/
   rsync -avz frontend/public/ ci:/opt/kanle/frontend/public/
   ```

4. **重启 PM2 服务与健康验证**：
   ```bash
   # 重启生产守护进程
   ssh ci "pm2 restart yublog-backend && pm2 restart yublog-frontend"

   # 验证生产服务状态
   ssh ci "curl -sI http://127.0.0.1:3000"
   curl -sI https://yugold.top
   ```

