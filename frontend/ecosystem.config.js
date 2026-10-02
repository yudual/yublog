const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  const envPath = path.join(__dirname, file);
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return env;
}

const fileEnv = {
  ...loadEnvFile(".env"),
  ...loadEnvFile(".env.production"),
  ...loadEnvFile(".env.local"),
};

module.exports = {
  apps: [{
    name: "yublog-frontend",
    script: ".next/standalone/server.js",
    cwd: __dirname,
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "300M",
    env: {
      NODE_ENV: "production",
      PORT: "3000",
      HOSTNAME: "127.0.0.1",
      ...fileEnv,
    },
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: __dirname + "/logs/err.log",
    out_file: __dirname + "/logs/out.log",
    merge_logs: true,
    kill_timeout: 5000
  }]
};
