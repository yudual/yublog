import dotenv from "dotenv";
import { sequelize, User, Post } from "../models";
import { generateShortId } from "../utils/short-id";

dotenv.config();

const COLLECTION_TITLE = "YuBlog 全栈架构与深度实录系列";

async function main() {
  await sequelize.authenticate();
  const user = await User.findOne();
  if (!user) {
    console.error("未找到管理员用户");
    process.exit(1);
  }

  // 检查是否已经存在该合辑
  let collection = await Post.findOne({
    where: { title: COLLECTION_TITLE, type: "collection" },
  });

  const p1 = await Post.findOne({ where: { title: "从 0 到 1：我如何用 Next.js 和 Express 搭出这个博客" } });
  const p2 = await Post.findOne({ where: { title: "YuBlog 深度功能全体验与排版实测" } });

  if (!p1 || !p2) {
    console.error("未能找到两篇测试文章");
    process.exit(1);
  }

  const childIds = [p1.id, p2.id];

  if (collection) {
    console.log(`合辑已存在: id=${collection.id}, shortId=${collection.shortId}`);
    // 确保关联更新
    await collection.update({
      collectionPostIds: childIds,
      status: "published",
      excerpt: "涵盖从 0 到 1 架构构建、全特性体验、富文本排版与多端交互的完整系列专栏。",
    } as any);
  } else {
    const shortId = await generateShortId();
    collection = await Post.create({
      userId: user.id,
      shortId,
      type: "collection",
      title: COLLECTION_TITLE,
      excerpt: "涵盖从 0 到 1 架构构建、全特性体验、富文本排版与多端交互的完整系列专栏。",
      cover: p1.cover || "",
      category: "合辑",
      content: "",
      images: [],
      status: "published",
      pinned: true,
      collectionId: null,
      collectionPostIds: childIds,
    } as any);
    console.log(`✅ 新建合辑成功: id=${collection.id}, shortId=${collection.shortId}`);
  }

  // 更新子文章关联
  await p1.update({ collectionId: collection.id, hideInHome: false } as any);
  await p2.update({ collectionId: collection.id, hideInHome: false } as any);

  console.log(`✅ 子文章已关联至合辑: p1=${p1.shortId}, p2=${p2.shortId}`);
  await sequelize.close();
}

main().catch((err) => {
  console.error("执行失败:", err);
  process.exit(1);
});
