import { Router, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { Op, fn, col } from "sequelize";
import { Post, Comment, Like, CommentLike, User, SiteSetting, Media } from "../models";
import { authenticate, authenticateOptional, AuthRequest, requireAdmin } from "../middleware/auth";
import { getClientIp } from "../utils/ip";
import { getRegionByIp } from "../utils/region";
import { generateShortId, extractCleanId } from "../utils/short-id";
import { triggerRevalidate } from "../utils/revalidate";
import { checkCommentRate, checkIpRate, recordCommentSuccess, resetViolations } from "../middleware/rateLimit";
import { blacklistService } from "../services/blacklist-service";
import { sendCommentNotification } from "../services/email-service";
import { parseVideoFromUrl, ParseError } from "./video-parse";
import { avatarHash } from "../utils/avatar-hash";
import { buildIdentity } from "../utils/identity";
import { loadCommentLikeStats } from "../utils/comment-like-stats";
import { enforceCommentGuard } from "../utils/comment-guard";
import { resolveReplyToEmail } from "../utils/comment-utils";
import { sanitizeCommentContent, sanitizeDisplayName, isProbablyEmail } from "../utils/sanitize";
import { shouldCountView } from "../utils/view-dedup";

const router = Router();

/**
 * 剥离文本中的 Frontmatter、HTML 标签与 Markdown 标记
 */
export function stripMarkdownAndFrontmatter(text: string): string {
  if (!text) return "";
  let clean = text.trim();
  // 1. 剥离多行 YAML Frontmatter 块（支持开头的 BOM 与空白）
  clean = clean.replace(/^\uFEFF?[\s]*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
  // 2. 剥离单行或未闭合截断的 Frontmatter（如 --- title: ... --- 或 --- title: ...）
  clean = clean.replace(/^---[ \t]*(?:title|category|tags|cover|excerpt|articleType|repostUrl|pinned|status|date):[\s\S]*?(?:---(?:\r?\n|\s)|$)/i, "");
  // 3. 剥离 HTML 注释与代码块 (``` 与 ~~~)
  clean = clean.replace(/<!--[\s\S]*?-->/g, "");
  clean = clean.replace(/(?:```|~~~)[a-zA-Z0-9_-]*\r?\n[\s\S]*?(?:(?:```|~~~)|$)/g, "");
  clean = clean.replace(/`([^`]+)`/g, "$1");
  // 4. 剥离表格分割行与竖线
  clean = clean.replace(/^\|?[\s-:]+\|[\s\-:|]+/gm, "");
  clean = clean.replace(/\|/g, " ");
  // 5. 剥离图片与链接语法
  clean = clean.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // 6. 剥离 Callout、引用、标题标记、列表符号等
  clean = clean.replace(/^>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*/gim, "");
  clean = clean.replace(/^>\s+/gm, "");
  clean = clean.replace(/^#{1,6}\s+/gm, "");
  clean = clean.replace(/^(\s*[-*+]\s+|\s*\d+\.\s+)/gm, "");
  clean = clean.replace(/[*~_]{1,3}([^*~_\n]+)[*~_]{1,3}/g, "$1");
  // 7. 剥离 HTML 标签与实体
  clean = clean
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  // 8. 规范化多余空白
  clean = clean.replace(/\s+/g, " ").trim();
  // 9. 兜底清理任何残存的 frontmatter 头部
  if (/^---\s*(?:title|category|tags|articleType):/i.test(clean)) {
    clean = clean.replace(/^---[\s\S]*?(?:---|$)/, "").trim();
  }
  return clean;
}

/**
 * 生成文章摘要：
 * - 如果已有 excerpt 且非假 frontmatter 垃圾数据、不等于标题，清洗后直接使用
 * - 否则从 content 剥离 Frontmatter 与 Markdown 语法后提取纯正文前 160 字符
 */
function getExcerpt(post: any): string {
  const title = (post.title || "").trim();
  let excerpt = (post.excerpt || "").trim();

  // 如果已有 excerpt，先检测是否是意外存入的 frontmatter
  if (excerpt) {
    const isJunk = /^---\s*(?:title|category|tags|articleType):/i.test(excerpt);
    if (!isJunk) {
      const cleanExp = stripMarkdownAndFrontmatter(excerpt);
      if (cleanExp && cleanExp !== title) return cleanExp;
    }
  }

  // 从 content 提取纯净正文作为摘要
  const content = post.content || "";
  let text = stripMarkdownAndFrontmatter(content);

  // 如果正文开头重复了文章大标题（例如原文第一行是 # 文章标题），去除之以避免重复
  if (title && text.startsWith(title)) {
    text = text.slice(title.length).trim();
  }

  return text.slice(0, 160);
}

/**
 * 获取文章/项目/动态的规范详情路径
 */
function getCanonicalPostPath(post: { shortId?: string | null; id: string; type?: string; category?: string }): string {
  const slug = post.shortId || post.id;
  if (post.category === "项目" || post.type === "project") return `/projects/${slug}`;
  if (post.type === "article" || post.type === "collection") return `/articles/${slug}`;
  return `/moments/${slug}`;
}

/**
 * 线程化排序评论：顶级评论按 (点赞多 → 时间早) 排序，回复按时间正序紧跟其父评论。
 * 匹配父评论用 author + email 双键，避免同名歧义。孤儿回复（父评论不在列表中）排末尾。
 */
function sortCommentsThreaded<T extends { id: string; replyTo?: string | null; replyToEmail?: string | null; replyToId?: string | null; author: string; email?: string | null; likeCount: number; createdAt: string }>(comments: T[]): T[] {
  const topLevel = comments.filter((c) => !c.replyTo);
  const replies = comments.filter((c) => c.replyTo);

  // 顶级评论：点赞多优先，同级时间早优先
  topLevel.sort((a, b) => {
    if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // 按父评论 ID 分组（优先用 replyToId 精确匹配，旧数据 fallback 到 author + email 双键）
  const repliesByParentId = new Map<string, T[]>();
  const repliesByNameKey = new Map<string, T[]>();
  for (const r of replies) {
    if (r.replyToId) {
      if (!repliesByParentId.has(r.replyToId)) repliesByParentId.set(r.replyToId, []);
      repliesByParentId.get(r.replyToId)!.push(r);
    } else {
      const key = `${r.replyTo}|${r.replyToEmail || ""}`;
      if (!repliesByNameKey.has(key)) repliesByNameKey.set(key, []);
      repliesByNameKey.get(key)!.push(r);
    }
  }
  // 每组回复按时间正序（对话顺序）
  for (const group of [...repliesByParentId.values(), ...repliesByNameKey.values()]) {
    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // 交织：父评论后紧跟其回复
  const result: T[] = [];
  for (const tc of topLevel) {
    result.push(tc);
    // 优先用 ID 匹配
    const byId = repliesByParentId.get(tc.id);
    if (byId) {
      result.push(...byId);
      repliesByParentId.delete(tc.id);
    }
    // 再用 name key 匹配旧数据
    const nameKey = `${tc.author}|${tc.email || ""}`;
    const byName = repliesByNameKey.get(nameKey);
    if (byName) {
      result.push(...byName);
      repliesByNameKey.delete(nameKey);
    }
  }
  // 孤儿回复（父评论不在列表中）排末尾
  for (const group of [...repliesByParentId.values(), ...repliesByNameKey.values()]) {
    result.push(...group);
  }
  return result;
}

function normalizeMusicPayload(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("音乐信息格式无效");
  const music = value as Record<string, unknown>;
  if (music.source !== "upload" || typeof music.url !== "string" || !music.url) {
    throw new Error("音乐仅支持已上传到 R2 的音频文件");
  }
  return music;
}

async function validateR2MusicPayload(value: unknown, userId: string) {
  const music = normalizeMusicPayload(value);
  if (!music) return null;
  const url = music.url;
  if (typeof url !== "string") throw new Error("音乐地址格式无效");
  const audio = await Media.findOne({ where: { url, uploaderId: userId, storageType: "r2" } });
  if (!audio || !audio.mimeType.startsWith("audio/")) {
    throw new Error("音乐必须引用本人上传的 R2 音频文件");
  }
  if (music.cover) {
    if (typeof music.cover !== "string") throw new Error("音乐封面格式无效");
    const cover = await Media.findOne({ where: { url: music.cover, uploaderId: userId, storageType: "r2" } });
    if (!cover || !cover.mimeType.startsWith("image/")) throw new Error("音乐封面必须引用本人上传的 R2 图片");
  }
  const name = typeof music.name === "string" ? music.name.trim().slice(0, 255) : "";
  const artist = typeof music.artist === "string" ? music.artist.trim().slice(0, 255) : "";
  const lrc = typeof music.lrc === "string" ? music.lrc.slice(0, 100_000) : undefined;
  return { name: name || audio.filename.replace(/\.[^.]+$/, ""), artist, cover: typeof music.cover === "string" ? music.cover : "", url: audio.url, source: "upload" as const, ...(lrc ? { lrc } : {}), ...(typeof music.autoplay === "boolean" ? { autoplay: music.autoplay } : {}) };
}

function formatPost(
  post: any,
  meLiked = false,
  commentLikesMap?: Map<string, { likeCount: number; meLiked: boolean }>
) {
  // 静态 R2 音频直接返回，无需解析外部音源。
  const music = post.music || null;
  let linkCard = post.linkCard;
  if (typeof linkCard === "string") {
    try { linkCard = JSON.parse(linkCard); } catch { linkCard = null; }
  }
  let video = post.video;
  if (typeof video === "string") {
    try { video = JSON.parse(video); } catch { video = null; }
  }
  let douban = post.douban;
  if (typeof douban === "string") {
    try { douban = JSON.parse(douban); } catch { douban = null; }
  }
  // 服务端标记作者评论：用 email 比对，前端只读 isAuthor 布尔值
  const authorEmail = post.author?.email ? String(post.author.email).toLowerCase() : "";
  return {
      id: post.id,
      shortId: post.shortId,
      type: post.type || "moment",
      title: post.title || "",
      excerpt: getExcerpt(post),
      cover: post.cover || "",
      category: post.category || "",
      content: post.content,
      images: post.images,
      location: post.location || null,
      music,
      linkCard: linkCard || null,
      video: video || null,
      douban: douban || null,
      pinned: post.pinned || false,
      likesDisabled: post.likesDisabled || false,
      commentsDisabled: post.commentsDisabled || false,
      createdAt: post.createdAt,
      region: post.region || "",
      articleType: post.articleType || "original",
      repostUrl: post.repostUrl || "",
      viewCount: post.viewCount || 0,
      status: post.status || "published",
      collectionId: post.collectionId || null,
      hideInHome: !!post.hideInHome,
      collectionArticles: (post.collectionArticles || []).map((a: any) => ({
        id: a.id,
        shortId: a.shortId,
        title: a.title || "",
        excerpt: getExcerpt(a),
        cover: a.cover || "",
        category: a.category || "",
        articleType: a.articleType || "original",
        viewCount: a.viewCount || 0,
        createdAt: a.createdAt,
      })),
      collection: post.belongingCollection
        ? { id: post.belongingCollection.id, shortId: post.belongingCollection.shortId, title: post.belongingCollection.title }
        : null,
      collectionContext: post.collectionContext || null,
      // 作者邮箱不下发：头像用 avatarHash，前端判断"是否博主"用 isOwner
      author: post.author
        ? {
            id: post.author.id,
            username: post.author.username,
            nickname: post.author.nickname,
            avatar: post.author.avatar,
            avatarHash: avatarHash(post.author.email),
            cover: post.author.cover,
            bio: post.author.bio,
            isOwner: (post.author as any).role === "admin",
          }
        : post.author,
      comments: sortCommentsThreaded(
        (post.comments || []).map((c: any) => {
          const likeData = commentLikesMap?.get(c.id);
          const isAuthor = !!(authorEmail && c.email && String(c.email).toLowerCase() === authorEmail);
          return {
            id: c.id,
            author: c.authorName,
            avatarHash: avatarHash(c.email),
            // 内部字段：旧数据线程排序需要 author+email 双键，仅服务端使用，输出前剔除
            email: c.email,
            replyToEmail: c.replyToEmail,
            website: c.website,
            replyTo: c.replyTo,
            replyToId: c.replyToId,
            content: c.content,
            createdAt: c.createdAt,
            likeCount: likeData?.likeCount ?? 0,
            meLiked: likeData?.meLiked ?? false,
            isAuthor,
            region: c.region || "",
          };
        })
      ).map(({ email: _email, replyToEmail: _replyToEmail, ...pub }) => pub),
      likes: post.likes?.filter((l: any) => l.status === "like")
        .map((l: any) => ({ name: l.name, avatarHash: avatarHash(l.email || l.user?.email) })) || [],
      meLiked,
    };
}

// GET /api/posts - list posts with pagination
// 支持 ?type=article/moment 过滤，?category=xxx 分类过滤
router.get("/", authenticateOptional, async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const offset = (page - 1) * limit;

  const where: any = {};
  const isAdmin = req.user?.role === "admin";
  const statusParam = req.query.status as string;

  if (isAdmin && statusParam && (statusParam === "published" || statusParam === "draft")) {
    where.status = statusParam;
  } else if (isAdmin && req.query.all === "1") {
    // 管理员请求全部状态
  } else {
    // 非管理员或公共查询，只返回已发布内容
    where.status = "published";
  }

  const typeParam = req.query.type as string;
  if (typeParam === "article" || typeParam === "moment" || typeParam === "collection") {
    where.type = typeParam;
  } else if (!typeParam) {
    // 首页综合信息流：隐藏被合辑打包包含的子文章，由合辑卡片代表展示
    where.hideInHome = false;
  }
  const categoryParam = req.query.category as string;
  if (categoryParam) {
    where.category = categoryParam;
  } else if ((typeParam === "article" || typeParam === "moment") && req.query.includeProjects !== "1") {
    // 纯文章与动态列表默认排除“项目”分类（项目有独立页面）
    where.category = { [Op.ne]: "项目" };
  }

  const { count, rows: posts } = await Post.findAndCountAll({
    distinct: true,
    where,
    include: [
      { model: User, as: "author", attributes: ["id", "email", "username", "nickname", "avatar", "cover", "bio", "role"] },
      // separate: hasMany 拆为独立查询，避免 posts×comments×likes 的 JOIN 笛卡尔积；
      // 属性白名单剔除敏感列（ip、replyToEmail 按需）与列表用不到的列
      {
        model: Comment,
        as: "comments",
        separate: true,
        attributes: ["id", "postId", "authorName", "email", "website", "replyTo", "replyToEmail", "replyToId", "content", "region", "createdAt"],
      },
      {
        model: Like,
        as: "likes",
        separate: true,
        attributes: ["postId", "name", "email", "status", "createdAt"],
        order: [["createdAt", "ASC"]],
        include: [{ model: User, as: "user", attributes: ["email"], required: false }],
      },
    ],
    order: [["pinned", "DESC"], ["createdAt", "DESC"]],
    limit,
    offset,
  });

  // 预查询当前访客在本页所有帖子上的点赞状态（一次性 IN 查询）
  // WP Ulike：只查 status='like' 的记录（unlike 是软删，不算已点赞）
  const ip = getClientIp(req);
  const userId = req.user?.id;
  const visitorId = req.visitorId;
  const emailParam = (req.query.email as string) || req.user?.email || "";
  const normalizedEmail = emailParam ? String(emailParam).trim().toLowerCase() : "";
  const identity = buildIdentity(userId, visitorId, normalizedEmail, ip);
  let likedPostIds = new Set<string>();
  if (identity && posts.length > 0) {
    const postIds = posts.map((p: any) => p.id);
    const myLikes = await Like.findAll({
      attributes: ["postId"],
      where: {
        postId: { [Op.in]: postIds },
        status: "like",
        ...identity,
      },
      group: ["postId"],
    });
    likedPostIds = new Set(myLikes.map((l: any) => l.postId));
  }

  // 全局批查询本页所有评论的点赞计数 + 当前访客点赞状态
  const allCommentIds = posts.flatMap((p: any) => (p.comments || []).map((c: any) => c.id));
  const commentLikesMap = await loadCommentLikeStats(allCommentIds, identity);

  // 1. 批量关联合辑（type === "collection"）的子文章列表
  const collectionPosts = posts.filter((p: any) => p.type === "collection");
  if (collectionPosts.length > 0) {
    const allChildIds = Array.from(
      new Set(
        collectionPosts.flatMap((cp: any) => {
          const ids = typeof cp.collectionPostIds === "string" ? JSON.parse(cp.collectionPostIds) : cp.collectionPostIds;
          return Array.isArray(ids) ? ids : [];
        })
      )
    );
    if (allChildIds.length > 0) {
      const childArticles = await Post.findAll({
        where: { id: { [Op.in]: allChildIds }, status: "published" },
        attributes: ["id", "shortId", "title", "excerpt", "content", "cover", "category", "articleType", "viewCount", "createdAt"],
      });
      const childMap = new Map(childArticles.map((a: any) => [a.id, a]));
      for (const cp of collectionPosts) {
        const ids = typeof cp.collectionPostIds === "string" ? JSON.parse(cp.collectionPostIds) : cp.collectionPostIds;
        (cp as any).collectionArticles = (Array.isArray(ids) ? ids : [])
          .map((id: string) => childMap.get(id))
          .filter(Boolean);
      }
    }
  }

  // 2. 批量关联子文章所属的合辑简要信息（如在文章专区等页面显示徽标）
  const postsWithCollection = posts.filter((p: any) => p.collectionId);
  if (postsWithCollection.length > 0) {
    const colIds = Array.from(new Set(postsWithCollection.map((p: any) => p.collectionId)));
    const cols = await Post.findAll({
      where: { id: { [Op.in]: colIds } },
      attributes: ["id", "shortId", "title"],
    });
    const colMap = new Map(cols.map((c: any) => [c.id, c]));
    for (const p of postsWithCollection) {
      (p as any).belongingCollection = colMap.get(p.collectionId) || null;
    }
  }

  res.json({
    data: posts.map((p: any) => formatPost(p, likedPostIds.has(p.id), commentLikesMap)),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit), hasMore: page * limit < count },
  });
});

// GET /api/posts/search?q=keyword — compact keyword search (title, excerpt, content)
// Must be registered before /:id so that "/search" is not parsed as an id.
router.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.json([]);
    return;
  }

  const posts = await Post.findAll({
    where: {
      status: "published",
      [Op.or]: [
        { title: { [Op.like]: `%${q}%` } },
        { excerpt: { [Op.like]: `%${q}%` } },
        { content: { [Op.like]: `%${q}%` } },
      ],
    },
    include: [
      { model: User, as: "author", attributes: ["id", "email", "nickname", "avatar"] },
    ],
    order: [["createdAt", "DESC"]],
    limit: 20,
  });

  const results = posts.map((p: any) => ({
    id: p.id,
    shortId: p.shortId,
    type: p.type,
    title: p.title || "",
    excerpt: getExcerpt(p),
    content: (p.content || "").replace(/<[^>]*>/g, "").slice(0, 120),
    cover: p.cover || "",
    createdAt: p.createdAt,
    author: p.author
      ? { nickname: p.author.nickname, avatar: p.author.avatar }
      : undefined,
  }));

  res.json(results);
});

// GET /api/posts/:id — 支持 UUID 和 shortId 两种格式（含粘连参数容错）
router.get("/:id", authenticateOptional, async (req: AuthRequest, res: Response) => {
  const rawId = String(req.params.id || "").trim();
  const cleanId = extractCleanId(rawId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

  const where = isUuid
    ? (rawId === cleanId ? { id: cleanId } : { [Op.or]: [{ id: rawId }, { id: cleanId }] })
    : (rawId === cleanId ? { shortId: cleanId } : { [Op.or]: [{ shortId: rawId }, { shortId: cleanId }, { id: cleanId }] });

  const post = await Post.findOne({
    where,
    include: [
      { model: User, as: "author", attributes: ["id", "email", "username", "nickname", "avatar", "cover", "bio", "role"] },
      // separate: hasMany 拆为独立查询，避免 posts×comments×likes 的 JOIN 笛卡尔积；
      // 属性白名单剔除敏感列（ip、replyToEmail 按需）与列表用不到的列
      {
        model: Comment,
        as: "comments",
        separate: true,
        attributes: ["id", "postId", "authorName", "email", "website", "replyTo", "replyToEmail", "replyToId", "content", "region", "createdAt"],
      },
      {
        model: Like,
        as: "likes",
        separate: true,
        attributes: ["postId", "name", "email", "status", "createdAt"],
        order: [["createdAt", "ASC"]],
        include: [{ model: User, as: "user", attributes: ["email"], required: false }],
      },
    ],
  });

  if (!post) {
    res.status(404).json({ message: "动态不存在" });
    return;
  }

  // 草稿状态权限拦截：仅管理员或作者本人可查看草稿，外部访客一律 404
  const isAdminOrAuthor = req.user?.role === "admin" || (req.user?.id && req.user.id === post.userId);
  if (post.status === "draft" && !isAdminOrAuthor) {
    res.status(404).json({ message: "内容不存在或尚未发布" });
    return;
  }

  // ?view=1 时原子递增阅读量（SSR 不带此参数，仅客户端 fetch 带）
  // 同一 visitorId 在 TTL 窗口内重复请求不重复计数，防刷新刷量
  if (req.query.view === "1" && shouldCountView(req.visitorId, post.id)) {
    await Post.increment("viewCount", { where: { id: post.id } });
    // Sequelize increment() 不更新内存中的实例，手动同步
    const current = (post.getDataValue("viewCount") as number) || 0;
    post.setDataValue("viewCount", current + 1);
  }

  // 查询当前访客是否已点赞该帖子（WP Ulike：只算 status='like'）
  const ip = getClientIp(req);
  const userId = req.user?.id;
  const visitorId = req.visitorId;
  const emailParam = (req.query.email as string) || req.user?.email || "";
  const normalizedEmail = emailParam ? String(emailParam).trim().toLowerCase() : "";
  const identity = buildIdentity(userId, visitorId, normalizedEmail, ip);
  let meLiked = false;
  if (identity) {
    const existing = await Like.findOne({
      where: { postId: post.id, status: "like", ...identity },
    });
    meLiked = !!existing;
  }

  // 批量查询评论点赞计数 + 当前访客点赞状态
  const commentIds = ((post as any).comments || []).map((c: any) => c.id);
  const commentLikesMap = await loadCommentLikeStats(commentIds, identity);

  // 1. 若自身为合辑，加载子文章列表
  if (post.type === "collection") {
    const ids = typeof post.collectionPostIds === "string" ? JSON.parse(post.collectionPostIds) : post.collectionPostIds;
    if (Array.isArray(ids) && ids.length > 0) {
      const childArticles = await Post.findAll({
        where: { id: { [Op.in]: ids }, status: "published" },
        attributes: ["id", "shortId", "title", "excerpt", "content", "cover", "category", "articleType", "viewCount", "createdAt"],
      });
      const childMap = new Map(childArticles.map((a: any) => [a.id, a]));
      (post as any).collectionArticles = ids.map((id: string) => childMap.get(id)).filter(Boolean);
    }
  } else if (post.collectionId) {
    // 2. 若属于某个合辑，加载所属合辑信息及前后篇导航
    const col = await Post.findByPk(post.collectionId, {
      attributes: ["id", "shortId", "title", "cover", "excerpt", "collectionPostIds"],
    });
    if (col) {
      const ids = typeof col.collectionPostIds === "string" ? JSON.parse(col.collectionPostIds) : col.collectionPostIds;
      if (Array.isArray(ids) && ids.length > 0) {
        const siblings = await Post.findAll({
          where: { id: { [Op.in]: ids }, status: "published" },
          attributes: ["id", "shortId", "title", "viewCount", "createdAt"],
        });
        const siblingMap = new Map(siblings.map((s: any) => [s.id, s]));
        const orderedSiblings = ids.map((cid: string) => siblingMap.get(cid)).filter(Boolean);
        const currentIndex = orderedSiblings.findIndex((s: any) => s.id === post.id);
        (post as any).collectionContext = {
          collectionId: col.id,
          collectionShortId: col.shortId,
          collectionTitle: col.title,
          posts: orderedSiblings.map((s: any, idx: number) => ({
            id: s.id,
            shortId: s.shortId,
            title: s.title,
            order: idx + 1,
            isCurrent: s.id === post.id,
          })),
          currentIndex,
          total: orderedSiblings.length,
          prevPost: currentIndex > 0 ? { id: orderedSiblings[currentIndex - 1].id, shortId: orderedSiblings[currentIndex - 1].shortId, title: orderedSiblings[currentIndex - 1].title } : null,
          nextPost: currentIndex >= 0 && currentIndex < orderedSiblings.length - 1 ? { id: orderedSiblings[currentIndex + 1].id, shortId: orderedSiblings[currentIndex + 1].shortId, title: orderedSiblings[currentIndex + 1].title } : null,
        };
        (post as any).belongingCollection = col;
      }
    }
  }

  res.json(formatPost(post, meLiked, commentLikesMap));
});

// POST /api/posts - create post (admin only)
router.post(
  "/",
  authenticate,
  requireAdmin,
  [
    body("type").optional().isIn(["moment", "article", "collection"]),
    body("title").optional().trim().isLength({ max: 200 }),
    body("excerpt").optional().trim().isLength({ max: 500 }),
    body("cover").optional().trim().isLength({ max: 512 }),
    body("category").optional().trim().isLength({ max: 50 }),
    body("articleType").optional().isIn(["original", "repost", "ai"]),
    body("repostUrl").optional().trim().isLength({ max: 500 }),
    body("content").optional().trim(),
    body("images").optional().isArray(),
    body("location").optional({ nullable: true }).isObject(),
    body("region").optional().trim().isLength({ max: 100 }),
    body("music").optional().isObject(),
    body("linkCard").optional({ nullable: true }).isObject(),
    body("video").optional({ nullable: true }).isObject(),
    body("douban").optional({ nullable: true }).isObject(),
    body("likesDisabled").optional().isBoolean(),
    body("commentsDisabled").optional().isBoolean(),
    body("pinned").optional().isBoolean(),
    body("status").optional().isIn(["published", "draft"]),
    body("createdAt").optional({ values: "falsy" }).isISO8601().toDate(),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const {
      type = "moment",
      title = "",
      excerpt = "",
      cover = "",
      category = "",
      articleType = "original",
      repostUrl = "",
      content = "",
      images = [],
      location = null,
      region: bodyRegion = "",
      music = null,
      linkCard = null,
      video = null,
      douban = null,
      likesDisabled = false,
      commentsDisabled = false,
      pinned = false,
      status = "published",
      createdAt,
    } = req.body;

    const normalizedMusic = await validateR2MusicPayload(music, req.user!.id);

    const ip = getClientIp(req);
    const ipRegion = await getRegionByIp(ip);
    const region = bodyRegion || ipRegion;

    let post: Post | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        post = await Post.create({
          userId: req.user!.id,
          shortId: generateShortId(),
          type,
          title,
          excerpt,
          cover,
          category,
          articleType,
          repostUrl,
          content,
          images,
          location,
          music: normalizedMusic,
          linkCard,
          video,
          douban,
          likesDisabled,
          commentsDisabled,
          pinned,
          status,
          ip,
          region,
          ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
        });
        break;
      } catch (err: any) {
        if (err.name === "SequelizeUniqueConstraintError" && attempt < 4) continue;
        throw err;
      }
    }

    const full = await Post.findByPk(post!.id, {
      include: [
        { model: User, as: "author", attributes: ["id", "email", "username", "nickname", "avatar", "cover", "bio", "role"] },
        {
          model: Comment,
          as: "comments",
          separate: true,
          attributes: ["id", "postId", "authorName", "email", "website", "replyTo", "replyToEmail", "replyToId", "content", "region", "createdAt"],
        },
        {
          model: Like,
          as: "likes",
          separate: true,
          attributes: ["postId", "name", "email", "status", "createdAt"],
          order: [["createdAt", "ASC"]],
          include: [{ model: User, as: "user", attributes: ["email"], required: false }],
        },
      ],
    });

    // 触发首页与详情页 ISR 重生成，确保刷新页面立即可见最新动态
    triggerRevalidate([getCanonicalPostPath(full || post!)]);

    res.status(201).json(formatPost(full));
  }
);

// PUT /api/posts/:id - update post (admin only)
router.put(
  "/:id",
  authenticate,
  requireAdmin,
  [
    param("id").isUUID(),
    body("type").optional().isIn(["moment", "article", "collection"]),
    body("title").optional({ nullable: true }).trim().isLength({ max: 200 }),
    body("excerpt").optional({ nullable: true }).trim().isLength({ max: 500 }),
    body("cover").optional({ nullable: true }).trim().isLength({ max: 2048 }),
    body("category").optional({ nullable: true }).trim().isLength({ max: 50 }),
    body("articleType").optional().isIn(["original", "repost", "ai"]),
    body("repostUrl").optional().trim().isLength({ max: 500 }),
    body("content").optional().trim(),
    body("images").optional().isArray(),
    body("location").optional({ nullable: true }).isObject(),
    body("region").optional({ nullable: true }).trim().isLength({ max: 100 }),
    body("music").optional({ nullable: true }).isObject(),
    body("linkCard").optional({ nullable: true }).isObject(),
    body("video").optional({ nullable: true }).isObject(),
    body("douban").optional({ nullable: true }).isObject(),
    body("likesDisabled").optional().isBoolean(),
    body("commentsDisabled").optional().isBoolean(),
    body("pinned").optional().isBoolean(),
    body("status").optional().isIn(["published", "draft"]),
    body("createdAt").optional({ values: "falsy" }).isISO8601().toDate(),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const post = await Post.findByPk(req.params.id as string);
    if (!post) {
      res.status(404).json({ message: "动态不存在" });
      return;
    }

    const normalizedMusic = req.body.music !== undefined
      ? await validateR2MusicPayload(req.body.music, req.user!.id)
      : post.music;

    const incomingPinned = req.body.pinned;
    const finalPinned = incomingPinned !== undefined ? incomingPinned : post.pinned;

    const oldPath = getCanonicalPostPath(post);

    const updateFields: any = {
      type: req.body.type !== undefined ? req.body.type : post.type,
      title: req.body.title !== undefined ? req.body.title : post.title,
      excerpt: req.body.excerpt !== undefined ? req.body.excerpt : post.excerpt,
      cover: req.body.cover !== undefined ? req.body.cover : post.cover,
      category: req.body.category !== undefined ? req.body.category : post.category,
      articleType: req.body.articleType !== undefined ? req.body.articleType : post.articleType,
      repostUrl: req.body.repostUrl !== undefined ? req.body.repostUrl : post.repostUrl,
      content: req.body.content !== undefined ? req.body.content : post.content,
      images: req.body.images !== undefined ? req.body.images : post.images,
      location: req.body.location !== undefined ? req.body.location : post.location,
      region: req.body.region !== undefined ? req.body.region : post.region,
      music: normalizedMusic,
      linkCard: req.body.linkCard !== undefined ? req.body.linkCard : post.linkCard,
      video: req.body.video !== undefined ? req.body.video : post.video,
      douban: req.body.douban !== undefined ? req.body.douban : post.douban,
      likesDisabled: req.body.likesDisabled !== undefined ? req.body.likesDisabled : post.likesDisabled,
      commentsDisabled: req.body.commentsDisabled !== undefined ? req.body.commentsDisabled : post.commentsDisabled,
      pinned: finalPinned,
      status: req.body.status !== undefined ? req.body.status : post.status,
    };
    if (req.body.createdAt) {
      updateFields.createdAt = new Date(req.body.createdAt);
    }

    await Post.update(updateFields, { where: { id: post.id } });
    await post.reload();

    const newPath = getCanonicalPostPath(post);
    // 触发首页与详情页 ISR 重生成，确保刷新页面看到最新动态
    triggerRevalidate(Array.from(new Set([oldPath, newPath])));

    res.json(formatPost(post));
  }
);

// PATCH /api/posts/:id/cover - 只更新封面，不提交正文
router.patch(
  "/:id/cover",
  authenticate,
  requireAdmin,
  [
    param("id").notEmpty(),
    body("cover").optional({ nullable: true }).trim().isLength({ max: 2048 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array(), message: "封面地址格式有误" });
      return;
    }

    const rawParam = String(req.params.id || "").trim();
    const idParam = extractCleanId(rawParam);
    const post = await Post.findOne({
      where: {
        [Op.or]: [{ id: idParam }, { shortId: idParam }, { id: rawParam }, { shortId: rawParam }],
      },
    });

    if (!post) {
      res.status(404).json({ message: "文章不存在或已被删除" });
      return;
    }

    const newCover = req.body.cover !== undefined ? String(req.body.cover).trim() : "";
    await post.update({ cover: newCover });

    const postPath = getCanonicalPostPath(post);
    triggerRevalidate([postPath, "/articles", "/"]);

    res.json({
      message: "封面已成功更新",
      id: post.id,
      shortId: post.shortId,
      cover: post.cover,
    });
  }
);

// DELETE /api/posts/:id - delete post (admin only)
router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const rawParam = String(req.params.id || "").trim();
    const idParam = extractCleanId(rawParam);
    if (!idParam) {
      res.status(400).json({ message: "缺少待删除的内容 ID" });
      return;
    }

    try {
      // 支持 UUID 或 shortId 查找
      const post = await Post.findOne({
        where: {
          [Op.or]: [{ id: idParam }, { shortId: idParam }, { id: rawParam }, { shortId: rawParam }],
        },
      });

      if (!post) {
        res.status(404).json({ message: "内容不存在或已被删除" });
        return;
      }

      const postId = post.id;
      const deletedPath = getCanonicalPostPath(post);

      // 1. 级联清理所有关联的评论点赞 (CommentLike) 和评论 (Comment)
      const comments = await Comment.findAll({
        where: { postId },
        attributes: ["id"],
      });
      const commentIds = comments.map((c) => c.id);
      if (commentIds.length > 0) {
        await CommentLike.destroy({ where: { commentId: { [Op.in]: commentIds } } }).catch(() => {});
        await Comment.destroy({ where: { id: { [Op.in]: commentIds } } }).catch(() => {});
      }

      // 2. 级联清理所有点赞 (Like)
      await Like.destroy({ where: { postId } }).catch(() => {});

      // 3. 处理系列合辑从属关系解绑
      if (post.type === "collection") {
        // 若自身为合辑卡片，将包含的子文章恢复独立展示
        await Post.update(
          { collectionId: null, hideInHome: false },
          { where: { collectionId: postId } }
        ).catch(() => {});
      } else if (post.collectionId) {
        // 若自身归属于某合辑，从该合辑的有序子文章 ID 列表中剔除
        const parentCol = await Post.findOne({ where: { id: post.collectionId, type: "collection" } });
        if (parentCol && parentCol.collectionPostIds) {
          const oldIds: string[] = Array.isArray(parentCol.collectionPostIds) ? parentCol.collectionPostIds : [];
          const nextIds = oldIds.filter((id) => id !== postId);
          await parentCol.update({ collectionPostIds: nextIds }).catch(() => {});
        }
      }

      // 4. 彻底删除文章/动态记录
      await post.destroy();

      // 5. 触发全站关键页面与自身详情页的 ISR 缓存失效，确保前台立即移除已删除内容
      triggerRevalidate([
        "/",
        "/articles",
        "/moments",
        "/projects",
        "/feed",
        "/archives",
        deletedPath,
      ]).catch(() => {});

      res.status(204).send();
    } catch (err: any) {
      console.error("[delete post error]:", err);
      res.status(500).json({ message: err.message || "删除内容失败" });
    }
  }
);

// PATCH /api/posts/:id/pin - 置顶/取消置顶（admin only）
router.patch(
  "/:id/pin",
  authenticate,
  requireAdmin,
  param("id").isUUID(),
  body("pinned").isBoolean(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const post = await Post.findByPk(req.params.id as string);
    if (!post) {
      res.status(404).json({ message: "动态不存在" });
      return;
    }

    post.pinned = req.body.pinned;
    await post.save();
    triggerRevalidate([getCanonicalPostPath(post)]);
    res.json({ id: post.id, pinned: post.pinned });
  }
);

// POST /api/posts/:id/refresh-video - 重新解析视频 URL（公开端点）
// 播放解析视频时，存储的 URL 可能已过期，需要重新解析获取新鲜 URL。
// skipCache=1 时跳过内存缓存（播放失败自动重试时使用）。
router.post(
  "/:id/refresh-video",
  param("id").isUUID(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const rate = checkIpRate("video-refresh", getClientIp(req));
    if (!rate.allowed) {
      res.status(429).json({ message: "操作过于频繁，请稍后再试", retryAfter: rate.retryAfter });
      return;
    }
    const post = await Post.findByPk(req.params.id as string);
    if (!post) {
      res.status(404).json({ message: "动态不存在" });
      return;
    }
    const video = post.video as any;
    if (!video || !video.sourceUrl) {
      res.status(400).json({ message: "该动态没有可解析的视频" });
      return;
    }
    try {
      const result = await parseVideoFromUrl(video.sourceUrl);
      // 更新 Post.video：保留 embedCode 等字段，覆盖解析结果
      const updatedVideo = { ...video, ...result };
      await post.update({ video: updatedVideo });
      triggerRevalidate([getCanonicalPostPath(post)]);
      res.json(result);
    } catch (err: any) {
      if (err instanceof ParseError) {
        res.status(err.status).json({ message: err.message });
      } else {
        res.status(502).json({ message: "解析服务暂时不可用，请稍后重试" });
      }
    }
  }
);

// POST /api/posts/:id/comments
router.post(
  "/:id/comments",
  [
    param("id").isUUID(),
    body("content").trim().isLength({ min: 1, max: 10_000 }),
    body("authorName").trim().isLength({ min: 1, max: 100 }),
    body("email").trim().isEmail().normalizeEmail(),
    body("website").optional().trim().isLength({ max: 255 }),
    body("replyTo").optional().trim().isLength({ max: 100 }),
    body("replyToEmail").optional().trim().isEmail().normalizeEmail(),
    body("replyToId").optional({ checkFalsy: true }).isUUID(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const post = await Post.findByPk(req.params.id as string, {
      include: [{ model: User, as: "author", attributes: ["email"] }],
    });
    if (!post) {
      res.status(404).json({ message: "动态不存在" });
      return;
    }

    const ip = getClientIp(req);
    const email: string = req.body.email;
    const commentRegion = await getRegionByIp(ip);

    // 评论防刷：黑名单 + 限流 + 自动封禁（总开关关闭时放行）
    const guard = await enforceCommentGuard(email, ip);
    if (!guard.ok) {
      res.status(guard.status).json(guard.body);
      return;
    }

    // 3. 违禁词检查：评论内容包含违禁词时拒绝发布
    const setting = await SiteSetting.findByPk(1);
    if (setting?.bannedWords) {
      let bannedWords: string[] = [];
      try {
        bannedWords = JSON.parse(setting.bannedWords);
        if (!Array.isArray(bannedWords)) bannedWords = [];
      } catch {
        bannedWords = [];
      }
      if (bannedWords.length > 0) {
        const lowerContent = (req.body.content || "").toLowerCase();
        const hit = bannedWords.find((w) => w && lowerContent.includes(w.toLowerCase()));
        if (hit) {
          res.status(403).json({
            message: `评论包含违禁词「${hit}」，请修改后重新发布`,
            code: "BANNED_WORD",
            word: hit,
          });
          return;
        }
      }
    }

    // 被回复者的邮箱由服务端从父评论推导，不信任客户端传值（公开接口已不下发明文邮箱）
    const replyToEmail = await resolveReplyToEmail({
      replyToId: req.body.replyToId || null,
      replyTo: req.body.replyTo || null,
      scope: { postId: post.id },
      fallback: req.body.replyToEmail || null,
    });

    const comment = await Comment.create({
      postId: post.id,
      authorName: req.body.authorName,
      email,
      website: req.body.website || null,
      replyTo: req.body.replyTo || null,
      replyToEmail: replyToEmail ?? undefined,
      replyToId: req.body.replyToId || null,
      content: sanitizeCommentContent(req.body.content),
      ip,
      region: commentRegion,
    });

    // 评论成功后记录一次命中（用于后续限流计数），并重置该用户的违规计数
    if (guard.antiSpamEnabled) recordCommentSuccess(email, ip);

    // 服务端标记作者评论（与 formatPost 逻辑一致）
    const authorEmail = (post as any).author?.email ? String((post as any).author.email).toLowerCase() : "";
    const isAuthor = !!(authorEmail && comment.email && String(comment.email).toLowerCase() === authorEmail);

    res.status(201).json({
      id: comment.id,
      author: comment.authorName,
      avatarHash: avatarHash(comment.email),
      website: comment.website,
      replyTo: comment.replyTo,
      replyToId: comment.replyToId,
      content: comment.content,
      createdAt: comment.createdAt,
      // 新评论默认无点赞，作者标记服务端计算
      likeCount: 0,
      meLiked: false,
      isAuthor,
      region: comment.region || "",
    });

    // 发送邮件通知（非关键路径，失败仅记日志，不阻塞响应）
    sendCommentNotification({
      actorNickname: comment.authorName,
      actorEmail: comment.email,
      content: comment.content,
      replyTo: comment.replyTo,
      replyToEmail: comment.replyToEmail,
      postContent: post.content || post.title || "",
      postId: post.id,
      commentId: comment.id,
    }).catch(() => {});
  }
);

// POST /api/posts/:id/comments/:commentId/likes
// 评论点赞 toggle — 复用 buildIdentity 与帖子点赞 toggle 逻辑：
//   - 验证 comment 属于 post（防越权）
//   - 维度互斥：userId > visitorId > email > ip（与帖子点赞完全一致）
//   - 软删翻转：已 like → unlike；已 unlike 或不存在 → like
//   - 只返回 { liked, likeCount }，不返回点赞名单（高频操作，简化响应）
//   - 不调用 triggerRevalidate（评论点赞频繁，避免 ISR 拖慢）
router.post(
  "/:id/comments/:commentId/likes",
  authenticateOptional,
  [param("id").isUUID(), param("commentId").isUUID()],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name: bodyName, email } = req.body;
    if (!bodyName || typeof bodyName !== "string") {
      res.status(400).json({ message: "缺少 name 参数" });
      return;
    }

    // 验证 comment 属于 post（防越权）
    const comment = await Comment.findOne({
      where: { id: req.params.commentId, postId: req.params.id },
    });
    if (!comment) {
      res.status(404).json({ message: "评论不存在" });
      return;
    }

    const userId = req.user?.id;
    const visitorId = req.visitorId;
    const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
    const ip = getClientIp(req);

    // 点赞频率限制（防恶意脚本无限刷赞）
    const rateCheck = checkIpRate("like", ip);
    if (!rateCheck.allowed) {
      res.status(429).json({
        message: `点赞过于频繁，请稍候再试`,
        retryAfter: rateCheck.retryAfter,
      });
      return;
    }

    const identity = buildIdentity(userId, visitorId, normalizedEmail, ip);
    if (!identity) {
      res.status(400).json({ message: "无法识别访客身份（无 userId/visitorId/email/IP）" });
      return;
    }

    // 已登录博主：强制使用其 nickname 作为显示名
    let displayName = bodyName;
    if (userId) {
      const user = await User.findByPk(userId, { attributes: ["nickname"] });
      if (user?.nickname) displayName = user.nickname;
    }

    // WP Ulike 软删翻转
    const existing = await CommentLike.findOne({
      where: { commentId: comment.id, ...identity },
    });

    let liked: boolean;
    if (existing) {
      const newStatus = existing.status === "like" ? "unlike" : "like";
      await existing.update({ status: newStatus, name: displayName });
      liked = newStatus === "like";
    } else {
      try {
        await CommentLike.create({
          commentId: comment.id,
          name: displayName,
          email: identity.email,
          ip: identity.ip,
          visitorId: identity.visitorId,
          userId: identity.userId,
          status: "like",
        });
        liked = true;
      } catch (err: any) {
        // 并发双击：findOne 与 create 之间另一请求插入了同维度记录，撞互斥唯一索引
        if (err?.name !== "SequelizeUniqueConstraintError") throw err;
        const raced = await CommentLike.findOne({ where: { commentId: comment.id, ...identity } });
        if (raced) {
          const newStatus = raced.status === "like" ? "unlike" : "like";
          await raced.update({ status: newStatus, name: displayName });
          liked = newStatus === "like";
        } else {
          liked = true;
        }
      }
    }

    // 返回当前评论的点赞计数（仅 status='like'）
    const likeCount = await CommentLike.count({
      where: { commentId: comment.id, status: "like" },
    });

    res.json({ liked, likeCount });
  }
);

// POST /api/posts/:id/likes
// WP Ulike 风格 toggle：找现有记录（含 status='unlike' 的，因为要翻转）
//   - 找到 → UPDATE status 翻转（like ↔ unlike）
//   - 未找到 → INSERT status='like'
//
// 维度优先级：userId (已登录博主) > visitorId (cookie 游客) > email (评论过的游客) > ip (兜底)
// 互斥取一而非 OR，确保 meLiked 和 toggle 用完全一致的单一条件，避免不一致 bug。
//
// 同时强制后端 likesDisabled 检查（修复 bug #1）：
//   - post.likesDisabled=true 时返回 403，前端 UI 应保持原状
//
// 已登录博主点赞时强制 name = user.nickname（修复 bug #6：登录用户点赞显示"访客"）
router.post(
  "/:id/likes",
  authenticateOptional,
  param("id").isUUID(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name: bodyName, email } = req.body;
    if (!bodyName || typeof bodyName !== "string") {
      res.status(400).json({ message: "缺少 name 参数" });
      return;
    }

    const post = await Post.findByPk(req.params.id as string);
    if (!post) {
      res.status(404).json({ message: "动态不存在" });
      return;
    }

    // 后端强制 likesDisabled（修复 bug #1）
    if (post.likesDisabled) {
      res.status(403).json({ message: "该动态已关闭点赞", code: "LIKES_DISABLED" });
      return;
    }

    const userId = req.user?.id;
    const visitorId = req.visitorId;
    const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
    const ip = getClientIp(req);

    // 点赞频率限制（防恶意脚本无限刷赞）
    const rateCheck = checkIpRate("like", ip);
    if (!rateCheck.allowed) {
      res.status(429).json({
        message: `点赞过于频繁，请稍候再试`,
        retryAfter: rateCheck.retryAfter,
      });
      return;
    }

    // 构造互斥身份（与 meLiked 完全一致）
    const identity = buildIdentity(userId, visitorId, normalizedEmail, ip);
    if (!identity) {
      res.status(400).json({ message: "无法识别访客身份（无 userId/visitorId/email/IP）" });
      return;
    }

    // 已登录博主：强制使用其 nickname 作为显示名（修复 bug #6）
    let displayName = bodyName;
    if (userId) {
      const user = await User.findByPk(userId, { attributes: ["nickname"] });
      if (user?.nickname) displayName = user.nickname;
    }

    // 找现有记录（含 status='unlike' 的，因为要翻转）
    const existing = await Like.findOne({
      where: { postId: post.id, ...identity },
    });

    let liked: boolean;
    if (existing) {
      // WP Ulike 软删翻转
      const newStatus = existing.status === "like" ? "unlike" : "like";
      await existing.update({ status: newStatus, name: displayName });
      liked = newStatus === "like";
    } else {
      // 新建点赞记录：仅存当前维度的字段，其他设 NULL（与 4 个互斥 UNIQUE 索引对齐）
      try {
        await Like.create({
          postId: post.id,
          name: displayName,
          email: identity.email,
          ip: identity.ip,
          visitorId: identity.visitorId,
          userId: identity.userId,
          status: "like",
        });
        liked = true;
      } catch (err: any) {
        // 并发双击：findOne 与 create 之间另一请求插入了同维度记录，撞互斥唯一索引
        if (err?.name !== "SequelizeUniqueConstraintError") throw err;
        const raced = await Like.findOne({ where: { postId: post.id, ...identity } });
        if (raced) {
          const newStatus = raced.status === "like" ? "unlike" : "like";
          await raced.update({ status: newStatus, name: displayName });
          liked = newStatus === "like";
        } else {
          liked = true;
        }
      }
    }

    // 返回 likes 列表（仅 status='like'，前端无需手动维护）
    const likes = await Like.findAll({
      where: { postId: post.id, status: "like" },
      include: [{ model: User, as: "user", attributes: ["email"], required: false }],
      attributes: ["name", "email"],
      order: [["createdAt", "ASC"]],
    });

    res.json({ liked, likes: likes.map((l: any) => ({ name: l.name, avatarHash: avatarHash(l.email || (l as any).user?.email) })) });

    // 触发首页与详情页 ISR 重生成，确保刷新页面立即看到最新点赞状态
    triggerRevalidate([getCanonicalPostPath(post)]);
  }
);

// PUT /api/likes/update-name — 访客填写昵称后，更新其历史点赞的显示名
// WP Ulike 多维度升级（priority: visitorId > email > ip）：
//   1. 优先 visitorId（cookie 游客）→ email 升级：补 email + 改 name + 清 visitorId/ip
//   2. 其次 IP 维度 → email 升级：补 email + 改 name + 清 ip
//   3. 已有 email 维度的：直接改 name（跨设备同步）
//   4. 无 email：只更新对应维度的 name
// 冲突处理：同 post 已存在 email 维度点赞 → 把旧 visitorId/IP 维度记录软删为 unlike
router.put("/likes/update-name", async (req: AuthRequest, res: Response) => {
  const { email, newName: rawNewName } = req.body;

  // 该接口为访客功能、无强鉴权（邮箱即身份凭证），因此按 IP 严格限流防批量枚举
  const ip = getClientIp(req);
  const renameRate = checkIpRate("like-rename", ip);
  if (!renameRate.allowed) {
    res.status(429).json({
      message: `操作过于频繁，请 ${renameRate.retryAfter ?? 60} 秒后重试`,
    });
    return;
  }

  if (!rawNewName || typeof rawNewName !== "string") {
    res.status(400).json({ message: "缺少 newName 参数" });
    return;
  }
  const newName = sanitizeDisplayName(rawNewName);
  if (!newName) {
    res.status(400).json({ message: "newName 不能为空" });
    return;
  }
  const normalizedEmail = isProbablyEmail(email) ? email.trim().toLowerCase() : "";

  const visitorId = req.visitorId;

  let updated = 0;

  if (normalizedEmail) {
    // 1) visitorId 维度 → email 升级（cookie 游客填邮箱）
    if (visitorId) {
      const cookieLikes = await Like.findAll({
        where: { visitorId, email: null, userId: null },
      });
      for (const like of cookieLikes) {
        const conflict = await Like.findOne({
          where: { postId: like.postId, email: normalizedEmail, userId: null },
        });
        if (conflict) {
          // 冲突：保留用户最新的点赞意图。
          // 旧维度是 like 但 email 维度是 unlike → 把 email 维度恢复为 like
          // 然后软删旧 visitorId 维度记录为 unlike（WP Ulike status 翻转）
          if (like.status === "like") {
            if (conflict.status === "unlike") {
              await conflict.update({ status: "like" });
            }
            await like.update({ status: "unlike" });
            updated++;
          }
        } else {
          // 升级：补 email + 改 name + 清 visitorId/ip（维度隔离）
          await like.update({
            email: normalizedEmail,
            name: newName,
            visitorId: null,
            ip: null,
          });
          updated++;
        }
      }
    }

    // 2) IP 维度 → email 升级（未带 cookie 的访客填邮箱）
    if (ip) {
      const ipLikes = await Like.findAll({
        where: { ip, email: null, visitorId: null, userId: null },
      });
      for (const like of ipLikes) {
        const conflict = await Like.findOne({
          where: { postId: like.postId, email: normalizedEmail, userId: null },
        });
        if (conflict) {
          // 冲突：保留用户最新的点赞意图。
          // 旧维度是 like 但 email 维度是 unlike → 把 email 维度恢复为 like
          // 然后软删旧 IP 维度记录为 unlike
          if (like.status === "like") {
            if (conflict.status === "unlike") {
              await conflict.update({ status: "like" });
            }
            await like.update({ status: "unlike" });
            updated++;
          }
        } else {
          // 升级：补 email + 改 name + 清 ip
          await like.update({
            email: normalizedEmail,
            name: newName,
            ip: null,
          });
          updated++;
        }
      }
    }

    // 3) 已存在 email 维度的点赞：直接改 name（跨设备同步）
    const emailLikes = await Like.findAll({
      where: { email: normalizedEmail, userId: null, status: "like" },
    });
    for (const like of emailLikes) {
      if (like.name !== newName) {
        await like.update({ name: newName });
        updated++;
      }
    }
  } else if (visitorId) {
    // 4a) 无 email、有 cookie：更新 visitorId 维度点赞的 name
    const cookieLikes = await Like.findAll({
      where: { visitorId, email: null, userId: null, status: "like" },
    });
    for (const like of cookieLikes) {
      if (like.name !== newName) {
        await like.update({ name: newName });
        updated++;
      }
    }
  } else if (ip) {
    // 4b) 无 email、无 cookie：只更新 IP 维度匿名点赞的 name
    const ipLikes = await Like.findAll({
      where: { ip, email: null, visitorId: null, userId: null, status: "like" },
    });
    for (const like of ipLikes) {
      if (like.name !== newName) {
        await like.update({ name: newName });
        updated++;
      }
    }
  }

  // 升级点赞维度后触发 ISR 重生成，前端立即看到昵称更新
  if (updated > 0) triggerRevalidate();

  res.json({ updated, newName });
});

export default router;
