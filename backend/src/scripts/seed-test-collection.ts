/**
 * 创建合辑测试数据：1 个合辑 + 3 篇子文章（仅本地调试用，幂等：存在同名合辑则跳过）
 * 运行：npx ts-node src/scripts/seed-test-collection.ts
 */
import dotenv from "dotenv";
import { sequelize, User, Post } from "../models";
import { generateShortId } from "../utils/short-id";

dotenv.config();

const COLLECTION_TITLE = "测试合辑：合辑功能验证";

async function createArticle(userId: string, title: string, daysAgo: number) {
  const [a, created] = await Post.findOrCreate({
    where: { title, type: "article" },
    defaults: {
      userId,
      shortId: await generateShortId(),
      type: "article",
      title,
      excerpt: `${title} 的测试摘要`,
      cover: "",
      category: "测试",
      content: `# ${title}\n\n这是一篇用于验证合辑功能的测试文章。`,
      images: [],
      status: "published",
      articleType: "original",
    },
  });
  if (created) {
    const d = new Date(Date.now() - daysAgo * 86400_000);
    await a.update({ createdAt: d } as any);
  }
  return a;
}

async function main() {
  await sequelize.authenticate();
  const user = (await User.findOne())!;
  const exists = await Post.findOne({ where: { title: COLLECTION_TITLE, type: "collection" } });
  if (exists) {
    console.log(`测试合辑已存在: ${exists.shortId}`);
    await sequelize.close();
    return;
  }

  const a1 = await createArticle(user.id, "合辑测试第一章：开篇", 6);
  const a2 = await createArticle(user.id, "合辑测试第二章：进阶", 3);
  const a3 = await createArticle(user.id, "合辑测试第三章：实战", 1);

  const colDate = new Date(Date.now() - 5 * 86400_000);
  const col = await Post.create({
    userId: user.id,
    shortId: await generateShortId(),
    type: "collection",
    title: COLLECTION_TITLE,
    excerpt: "包含《合辑测试第一章：开篇》等 3 篇精选系列文章",
    cover: "",
    category: "合辑",
    content: "",
    images: [],
    status: "published",
    pinned: false,
  } as any);
  await col.update({ createdAt: colDate } as any);

  for (const a of [a1, a2, a3]) {
    await a.update({ collectionId: col.id, hideInHome: true });
  }

  console.log(`✅ 测试合辑已创建: shortId=${col.shortId} 子文章=[${a1.shortId}, ${a2.shortId}, ${a3.shortId}]`);
  await sequelize.close();
}

main().catch((e) => {
  console.error("失败:", e);
  process.exit(1);
});
