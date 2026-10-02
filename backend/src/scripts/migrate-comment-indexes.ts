/**
 * 评论表索引补齐迁移
 *
 * 背景：comments 表此前只有 reply_to_email / author_name 两个索引，
 * page_id 无外键（InnoDB 不会自动建索引），pageId / replyToId 相关查询全表扫。
 * 本迁移补齐：
 *   - idx_comments_page_id        （内容页评论列表、回复目标校验）
 *   - idx_comments_reply_to_id    （嵌套回复拉取）
 *
 * 运行：npm run db:migrate-comment-indexes
 * 幂等：索引已存在时跳过。
 */
import dotenv from "dotenv";
import sequelize from "../config/database";

dotenv.config();

const INDEXES = [
  { name: "idx_comments_page_id", table: "comments", columns: "page_id" },
  { name: "idx_comments_reply_to_id", table: "comments", columns: "reply_to_id" },
];

export async function migrateCommentIndexes() {
  for (const { name, table, columns } of INDEXES) {
    try {
      await sequelize.query(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` (\`${columns}\`)`);
      console.log(`Added index: ${name} (${columns})`);
    } catch (error: any) {
      const message = String(error?.message || error);
      if (/duplicate key name|already exists/i.test(message)) {
        console.log(`Index already exists: ${name}`);
      } else {
        throw error;
      }
    }
  }
}

async function main() {
  try {
    await sequelize.authenticate();
    await migrateCommentIndexes();
  } catch (error) {
    console.error("Comment indexes migration failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main();
}
