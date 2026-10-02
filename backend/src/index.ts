/**
 * 传统部署入口（PM2 / Docker / 裸机 node dist/index.js）。
 *
 * 这是一个长期运行的进程：启动时初始化一次数据库连接和插件，随后
 * 用 app.listen() 常驻监听端口。
 *
 * Vercel Serverless 部署请使用 api/index.ts（不会执行本文件）——
 * 两者共享同一个 src/app.ts（路由/中间件）和 src/bootstrap.ts（初始化逻辑），
 * 业务逻辑完全一致，只是进程模型不同。详见 VERCEL_DEPLOYMENT.md。
 */
import app from "./app";
import { ensureReady } from "./bootstrap";
import { sequelize } from "./models";

const PORT = process.env.PORT || 4000;

/** 优雅关闭：停止接新连接 → 等在途请求完成 → 关闭数据库连接池 */
function setupGracefulShutdown(server: import("http").Server) {
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] 收到 ${signal}，正在优雅关闭...`);
    // PM2/系统默认给 10-30 秒宽限期，超时强制退出
    const forceTimer = setTimeout(() => {
      console.error("[shutdown] 等待超时，强制退出");
      process.exit(1);
    }, 8000);
    forceTimer.unref();
    server.close(async () => {
      try {
        await sequelize.close();
        console.log("[shutdown] 已关闭 HTTP 服务与数据库连接池");
      } catch (err) {
        console.error("[shutdown] 关闭数据库连接池失败:", err);
      }
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

async function main() {
  try {
    await ensureReady();

    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    setupGracefulShutdown(server);
  } catch (error) {
    console.error("Unable to bootstrap backend:", error);
    process.exit(1);
  }
}

main();
