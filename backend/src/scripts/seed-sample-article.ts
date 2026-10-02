/**
 * 范文示例文章种子脚本 — 向本地数据库插入一篇 type=article 的长文范文
 *
 * 运行：npx ts-node src/scripts/seed-sample-article.ts
 *
 * 说明：
 *   - 作者自动挂到数据库中的第一个用户（通常是 admin）
 *   - 正文为 Markdown，前端 ArticleReader 会自动识别渲染
 *   - 重复运行会插入多篇，请勿无脑重复执行
 */
import dotenv from "dotenv";
import { sequelize, User, Post } from "../models";
import { generateShortId } from "../utils/short-id";

dotenv.config();

const TITLE = "从 0 到 1：我如何用 Next.js 和 Express 搭出这个博客";

const EXCERPT =
  "与其在各个平台之间流浪，不如自己盖一座房子。这篇文章记录了 YuBlog 的完整搭建过程：前端 Next.js 16 + React 19，后端 Express + Sequelize + MySQL，图片直传 Cloudflare R2，以及一个 1 核 1G 小鸡服务器上的部署踩坑实录。";

const CONTENT = `> 与其在各个平台之间流浪，不如自己盖一座房子。欢迎来到我的自留地 —— **YuBlog**。

这是博客里的第一篇范文，既当开篇文章，也当一份"官方写作示范"：你可以参考这篇文章的排版结构来写自己的内容。全文覆盖了常用的 Markdown 语法 —— 标题、列表、引用、代码块、表格、链接与图片，方便你对照预览效果。

## 为什么要自己搭博客

在动手之前，我也纠结过很久：掘金、知乎、公众号都很成熟，为什么还要自己造轮子？想来想去无非三点：

1. **数据的自主权** —— 文章、评论、点赞都存在自己的数据库里，不怕平台改规则。
2. **完全的可定制性** —— 想要朋友圈式的信息流、想要合辑、想要豆瓣标记，自己写就行。
3. **折腾本身就有乐趣** —— 从选型到部署，每一步都是学习。

## 整体架构

整个系统分为前端、后端、对象存储三部分，各司其职：

| 模块 | 技术选型 | 说明 |
| --- | --- | --- |
| 前端 | Next.js 16 + React 19 | App Router + 服务端组件，Turbopack 加速开发 |
| 后端 | Express 5 + Sequelize | RESTful API，MySQL 持久化 |
| 媒体 | Cloudflare R2 | 浏览器直传，后端不经手图片字节流 |
| 部署 | 1C/1G VPS + GitHub Actions | 本地或云端构建，服务器只负责跑 |

一个核心原则：**后端保持轻薄**。所有计算密集的事情（构建、图片压缩）都不放在运行时。

## 前端：服务端组件优先

列表页尽量使用服务端组件直接查库渲染，只把真正需要交互的部分拆成客户端组件。比如文章列表的骨架屏：

\`\`\`tsx
export default function Loading() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
\`\`\`

配合 \`loading.tsx\` 约定，路由切换时用户看到的是结构一致的骨架，而不是白屏或转圈。

## 后端：一件"小事"值得较真

后端最值得说的不是某个炫技功能，而是一些小事：限流中间件、IP 黑名单、评论的 XSS 过滤。比如给发帖接口加一层简单的滑动窗口限流：

\`\`\`ts
export function rateLimit({ windowMs, max }: RateLimitOptions) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const window = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (window.length >= max) {
      return res.status(429).json({ message: "请求过于频繁，请稍后再试" });
    }

    window.push(now);
    hits.set(key, window);
    next();
  };
}
\`\`\`

## 图片：浏览器端压缩 + 直传 R2

5MB 的手机原图不该出现在服务器上。上传流程被设计成三步：

1. 前端读取文件，等比缩放到最长边 **2048px**；
2. 转成高压缩率的 **WebP** 格式；
3. 凭预签名 URL 直传 R2，后端只登记元数据。

这样后端内存里永远不会出现大图字节流，1G 小内存的服务器也能稳如老狗。

## 部署：把构建关在服务器外面

最后一条经验用一次 OOM 换来的：**永远不要在 1 核 1G 的生产机上跑 next build**。构建一律放在本地或 GitHub Actions，服务器只拉产物、重启进程。Swap 不是用来跑编译的，是用来救命的。

---

写博客是一场长跑，这是第一步。接下来我会把踩过的坑、写过的代码慢慢搬进来。如果你也在搭自己的博客，欢迎交流。
`;

async function main() {
  await sequelize.authenticate();

  const user = await User.findOne({ order: [["createdAt", "ASC"]] });
  if (!user) {
    throw new Error("数据库中没有任何用户，请先注册/初始化管理员");
  }

  const exists = await Post.findOne({ where: { title: TITLE, type: "article" } });
  if (exists) {
    console.log(`范文已存在，跳过插入（shortId: ${exists.shortId}）`);
    await sequelize.close();
    return;
  }

  const post = await Post.create({
    userId: user.id,
    shortId: await generateShortId(),
    type: "article",
    title: TITLE,
    excerpt: EXCERPT,
    cover: "",
    category: "建站",
    content: CONTENT,
    images: [],
    location: null,
    music: null,
    linkCard: null,
    video: null,
    douban: null,
    pinned: false,
    likesDisabled: false,
    commentsDisabled: false,
    ip: "",
    region: "",
    articleType: "original",
    repostUrl: "",
    viewCount: 0,
    status: "published",
  });

  console.log(`✅ 范文已插入: id=${post.id} shortId=${post.shortId} title=${post.title}`);
  await sequelize.close();
}

main().catch((err) => {
  console.error("❌ 插入失败:", err);
  process.exit(1);
});
