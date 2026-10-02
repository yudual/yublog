<div align="center">

# YuBlog

**基于微信朋友圈交互美学的现代化全栈个人博客系统**

*Crafted by [Dual](https://yugold.top) · 二开定制版*

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-20232a?style=flat-square&logo=react)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5.2-white?style=flat-square&logo=express)](https://expressjs.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare_R2-f38020?style=flat-square&logo=cloudflare)](https://www.cloudflare.com/products/r2/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[🌐 访问线上主站](https://yugold.top) · [✨ 核心特性](#-核心特性) · [⚡ 快速上手](#-快速上手) · [🚢 部署方式](#-部署概览)

</div>

---

## 💡 简介

**YuBlog** 是一套融合了**微信朋友圈灵动交互**与**独立博客长文承载能力**的轻量现代化全栈博客系统。

由 **Dual** 基于开源原型进行深度二次开发，专为个人生产环境定制，追求极简视觉、丝滑动画与零维护成本的云原生体验。

- 线上主站：[https://yugold.top](https://yugold.top)
- 媒体加速：`https://media.yugold.top`

---

## ✨ 核心特性

- 📱 **朋友圈流光动态**：图文九宫格、Live Photo、短视频播放、高德地图定位、网易云/R2 音乐与外链卡片。
- 📚 **深度长文与合辑**：专为博客定制的极简轻量 Markdown 编辑器、移动端横滑防遮挡工具栏、细粒度中英加权阅读时长与字数统计、目录大纲随动、系列长文合辑封装。
- 💬 **沉浸式互动体系**：拟真点赞动效、基于滑动窗口的高频点赞 IP 限流、嵌套楼层回复、经典微信表情库、拟真微信对话排版的邮件通知。
- 🎵 **全局浮窗音乐流**：媒体素材库直传 Cloudflare R2，全局单例常驻跨路由无缝续播，支持 LRC 歌词逐行高亮滚动。
- 🎬 **豆瓣书影音同步**：一键同步个人观影、阅读与听歌足迹，后端快照缓存，公网毫秒级加载。
- ⚡ **无感压缩与图床自由**：浏览器端上传前自动 WebP 等比智能压缩；支持任意外部图床免配置直连。
- 🛡️ **优雅容错与平滑体验**：全站图片破损自愈与降级占位（SafeImage）、路由级骨架屏（loading.tsx）、原生 View Transitions 视图过渡、深色模式高对比代码高亮。
- 🎨 **极简拟态设计**：内嵌 HarmonyOS Sans 字体，原生支持暗黑/明亮无感切换，视觉通透干净。

---

## 🛠️ 技术栈

| 层次 | 技术选型 |
| :--- | :--- |
| **前端** | Next.js 16 (App Router · Standalone) · React 19 · Tailwind CSS v4 · Zustand |
| **后端** | Express 5 · TypeScript 6 · Sequelize 6 · Node.js 20+ |
| **数据与存储** | MySQL / TiDB Cloud · Cloudflare R2 (预签名直传，零服务器流量消耗) |
| **网络加速** | Tencent Cloud EdgeOne / Cloudflare CDN |

---

## ⚡ 快速上手

### 本地运行

```bash
# 1. 克隆仓库
git clone https://github.com/yudual/yublog.git
cd yublog

# 2. 配置环境变量
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# 3. 初始化数据库（仅需执行一次）
cd backend && pnpm install && pnpm db:init && cd ..

# 4. 一键启动全栈服务（自动处理端口与日志聚合）
pnpm dev
```

启动完成后在浏览器访问：
- 前台首页：`http://localhost:3000`
- 管理后台：`http://localhost:3000/admin`
- 后端接口：`http://localhost:4000/api/health`

---

## 🚢 部署概览

### 方案 A：Vercel + TiDB Cloud + Cloudflare R2（推荐 · 零运维）

前后端作为两个独立的 Vercel 项目部署：
1. **后端 (Vercel)**：Root Directory 设为 `backend`，Framework 选 `Other`，配置数据库与 R2 环境变量。
2. **前端 (Vercel)**：Root Directory 设为 `frontend`，Framework 选 `Next.js`，设置 `BACKEND_URL` 指向后端。
3. 详细 Serverless 改造细节与说明见 [backend/VERCEL_DEPLOYMENT.md](backend/VERCEL_DEPLOYMENT.md)。

### 方案 B：VPS 自托管（PM2 + Nginx）

> ⚠️ **生产铁律**：严禁在 1C1G 小内存 VPS 上执行 `pnpm build` 或 `next build`！所有产物必须在本地或 CI 构建完成后打包分发。

```bash
# 1. 本地打包（生成后端 dist/ 与前端独立 Standalone 产物）
cd backend && pnpm build && cd ..
cd frontend && pnpm build && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && cd ..

# 2. 同步产物至服务器并通过 PM2 守护启动 / 重启
pm2 start backend/ecosystem.config.js   # 进程名: yublog-backend
pm2 start frontend/ecosystem.config.js  # 进程名: yublog-frontend
# 已启动时重载: pm2 restart yublog-backend && pm2 restart yublog-frontend
```

Nginx 模板见 [`deploy/nginx.conf`](deploy/nginx.conf)。

---

## 🤝 鸣谢与开源支持

本项目基于开源社区优秀作品启发并二次开发，特别鸣谢：

- **原作者**：[小予](https://kanle.net)（[kanle](https://github.com/zilinnb/kanle) 项目作者）
- [pyq](https://github.com/zhjurz/pyq) 开源原型
- [Next.js](https://nextjs.org/) · [React](https://react.dev/) · [Tiptap](https://tiptap.dev/)

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 协议开源。

Copyright (c) 2026 zilinnb  
Copyright (c) 2026 [Dual](https://yugold.top)
