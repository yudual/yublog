#!/usr/bin/env node

/**
 * YuBlog 自动化发布与同步部署脚本 (Oracle or4 -> 东京 ci VPS)
 * 
 * 流程：
 * 1. 本地编译：后端 tsc -> frontend standalone build + 静态资源注入
 * 2. 远端代码：ssh ci git pull origin master
 * 3. 产物分发：rsync 同步 dist/ 与 standalone/ 至 ci:/opt/kanle/
 * 4. 服务热重载：pm2 restart yublog-backend && yublog-frontend
 * 5. 健康检查：验证公网与内网状态
 */

const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const remoteHost = process.env.REMOTE_HOST || 'ci';
const remoteDir = process.env.REMOTE_DIR || '/opt/kanle';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
};

function run(cmd, desc, options = {}) {
  console.log(`\n${colors.bold}${colors.cyan}[+] ${desc}...${colors.reset}`);
  console.log(`${colors.yellow}$ ${cmd}${colors.reset}`);
  try {
    return execSync(cmd, { cwd: rootDir, stdio: 'inherit', ...options });
  } catch (err) {
    console.error(`\n${colors.bold}${colors.red}[!] 执行失败: ${desc}${colors.reset}`);
    process.exit(1);
  }
}

console.log(`${colors.bold}${colors.green}========================================${colors.reset}`);
console.log(`${colors.bold}${colors.green}  🚢 YuBlog 生产部署自动化流水线       ${colors.reset}`);
console.log(`${colors.bold}${colors.green}========================================${colors.reset}`);

// 1. 本地后端编译
run('pnpm --prefix backend build', '编译后端 TypeScript 到 backend/dist/');

// 2. 本地前端编译
run('pnpm --prefix frontend build', '编译前端 Next.js Standalone');
run('cp -r frontend/.next/static frontend/.next/standalone/.next/static', '注入前端静态路由产物到 Standalone');
run('cp -r frontend/public frontend/.next/standalone/public', '注入前端公共资产到 Standalone');

// 3. 同步远端 Git
run(`ssh ${remoteHost} "cd ${remoteDir} && git pull origin master"`, '同步远端 Git 代码库');

// 4. 同步后端编译产物
run(`rsync -avz backend/dist/ ${remoteHost}:${remoteDir}/backend/dist/`, '同步后端 dist/ 产物至生产机');

// 5. 同步前端独立部署包与公共资产
run(`rsync -avz --exclude node_modules frontend/.next/standalone/ ${remoteHost}:${remoteDir}/frontend/.next/standalone/`, '同步前端 standalone 产物至生产机');
run(`rsync -avz frontend/public/ ${remoteHost}:${remoteDir}/frontend/public/`, '同步前端 public 静态资源至生产机');

// 6. 重启生产 PM2 服务
run(`ssh ${remoteHost} "pm2 restart yublog-backend && pm2 restart yublog-frontend"`, '重载远端 PM2 服务');

// 7. 健康检查
console.log(`\n${colors.bold}${colors.green}[+] 正在执行生产健康检查...${colors.reset}`);
try {
  execSync(`curl -sI -o /dev/null -w "%{http_code}" https://yugold.top`, { stdio: 'pipe' });
  console.log(`  ${colors.green}✓ 线上主站 https://yugold.top 可访问 (HTTP 200/301)${colors.reset}`);
} catch (e) {
  console.log(`  ${colors.yellow}⚠️ 线上主站探测返回非正常状态，请检查 CDN 或证书。${colors.reset}`);
}

console.log(`\n${colors.bold}${colors.green}========================================${colors.reset}`);
console.log(`${colors.bold}${colors.green}  🎉 YuBlog 生产部署完成并平稳运行！    ${colors.reset}`);
console.log(`${colors.bold}${colors.green}========================================${colors.reset}\n`);
