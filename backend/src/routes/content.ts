import { Router, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { fn, col, Op } from "sequelize";
import {
  CatalogCategory,
  CatalogItem,
  Comment,
  CommentLike,
  ContentPage,
  Media,
  User,
} from "../models";
import { authenticate, authenticateOptional, AuthRequest, requireAdmin } from "../middleware/auth";
import { buildIdentity } from "../utils/identity";
import { loadCommentLikeStats } from "../utils/comment-like-stats";
import { enforceCommentGuard } from "../utils/comment-guard";
import { getClientIp } from "../utils/ip";
import { getRegionByIp } from "../utils/region";
import { checkCommentRate, recordCommentSuccess, resetViolations } from "../middleware/rateLimit";
import { blacklistService } from "../services/blacklist-service";
import { sanitizeCommentContent } from "../utils/sanitize";
import { triggerRevalidate } from "../utils/revalidate";
import { avatarHash } from "../utils/avatar-hash";
import { resolveReplyToEmail } from "../utils/comment-utils";
import { isValidHttpUrl, normalizeHttpUrl } from "../utils/web-url";
import type { CatalogCollection } from "../models/CatalogCategory";

const router = Router();
const COLLECTIONS = new Set<CatalogCollection>(["equipment", "labs"]);

function collectionFrom(value: unknown): CatalogCollection | null {
  return typeof value === "string" && COLLECTIONS.has(value as CatalogCollection)
    ? (value as CatalogCollection)
    : null;
}

function ensureValid(req: Request, res: Response) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return true;
  res.status(400).json({ errors: errors.array() });
  return false;
}

function formatComment(comment: any, authorEmail: string, likes?: Map<string, { likeCount: number; meLiked: boolean }>) {
  const like = likes?.get(comment.id);
  return {
    id: comment.id,
    author: comment.authorName,
    avatarHash: avatarHash(comment.email),
    website: comment.website,
    replyTo: comment.replyTo,
    replyToId: comment.replyToId,
    content: comment.content,
    createdAt: comment.createdAt,
    likeCount: like?.likeCount || 0,
    meLiked: like?.meLiked || false,
    isAuthor: !!(authorEmail && comment.email && String(comment.email).toLowerCase() === authorEmail),
    region: comment.region || "",
  };
}

async function commentLikes(comments: any[], req: AuthRequest) {
  const ids = comments.map((comment) => comment.id);
  const identity = buildIdentity(req.user?.id, req.visitorId, req.user?.email || "", getClientIp(req));
  return loadCommentLikeStats(ids, identity);
}

async function aboutPage() {
  return ContentPage.findOne({
    where: { slug: "about" },
    include: [
      { model: User, as: "author", attributes: ["id", "email", "nickname", "avatar", "cover", "bio"] },
      { model: Comment, as: "comments" },
    ],
  }) as any;
}

async function getAbout(req: AuthRequest, res: Response) {
  const page = await aboutPage();
  if (!page) {
    res.status(404).json({ message: "关于页面尚未初始化，请先运行 db:init" });
    return;
  }
  const likes = await commentLikes(page.comments || [], req);
  const authorEmail = String(page.author?.email || "").toLowerCase();
  res.json({
    id: page.id,
    slug: page.slug,
    title: "关于",
    content: page.content,
    commentsDisabled: false,
    comments: (page.comments || []).map((comment: any) => formatComment(comment, authorEmail, likes)),
  });
}

router.get("/pages/about", authenticateOptional, getAbout);

router.put(
  "/pages/about",
  authenticate,
  requireAdmin,
  body("content").isString().isLength({ max: 1_000_000 }),
  async (req: AuthRequest, res: Response) => {
    if (!ensureValid(req, res)) return;
    const page = await ContentPage.findOne({ where: { slug: "about" } });
    if (!page) {
      res.status(404).json({ message: "关于页面尚未初始化，请先运行 db:init" });
      return;
    }
    await page.update({ content: req.body.content });
    void triggerRevalidate();
    res.json({ id: page.id, title: "关于", content: page.content });
  }
);

router.post(
  "/pages/about/comments",
  [
    body("content").trim().isLength({ min: 1, max: 10_000 }),
    body("authorName").trim().isLength({ min: 1, max: 100 }),
    body("email").trim().isEmail().normalizeEmail(),
    body("website").optional().trim().isLength({ max: 255 }).custom(isValidHttpUrl),
    body("replyTo").optional().trim().isLength({ max: 100 }),
    body("replyToEmail").optional().trim().isEmail().normalizeEmail(),
    body("replyToId").optional({ checkFalsy: true }).isUUID(),
  ],
  async (req: AuthRequest, res: Response) => {
    if (!ensureValid(req, res)) return;
    const page = await ContentPage.findOne({ where: { slug: "about" }, include: [{ model: User, as: "author", attributes: ["email"] }] }) as any;
    if (!page) {
      res.status(404).json({ message: "关于页面尚未初始化，请先运行 db:init" });
      return;
    }
    const ip = getClientIp(req);
    const email = req.body.email as string;
    const guard = await enforceCommentGuard(email, ip);
    if (!guard.ok) {
      res.status(guard.status).json(guard.body);
      return;
    }
    const replyToEmail = await resolveReplyToEmail({
      replyToId: req.body.replyToId || null,
      replyTo: req.body.replyTo || null,
      scope: { pageId: page.id },
      fallback: req.body.replyToEmail || null,
    });
    const comment = await Comment.create({
      pageId: page.id,
      authorName: req.body.authorName,
      email,
      website: normalizeHttpUrl(req.body.website) || undefined,
      replyTo: req.body.replyTo || null,
      replyToEmail: replyToEmail ?? undefined,
      replyToId: req.body.replyToId || null,
      content: sanitizeCommentContent(req.body.content),
      ip,
      region: await getRegionByIp(ip),
    });
    if (guard.antiSpamEnabled) recordCommentSuccess(email, ip);
    res.status(201).json(formatComment(comment, String(page.author?.email || "").toLowerCase()));
  }
);

router.post(
  "/pages/about/comments/:commentId/likes",
  authenticateOptional,
  param("commentId").isUUID(),
  async (req: AuthRequest, res: Response) => {
    if (!ensureValid(req, res)) return;
    const page = await ContentPage.findOne({ where: { slug: "about" } });
    const comment = page
      ? await Comment.findOne({ where: { id: req.params.commentId, pageId: page.id } })
      : null;
    if (!comment) {
      res.status(404).json({ message: "评论不存在" });
      return;
    }
    const identity = buildIdentity(req.user?.id, req.visitorId, String(req.body.email || "").trim().toLowerCase(), getClientIp(req));
    if (!identity) {
      res.status(400).json({ message: "无法识别访客身份" });
      return;
    }
    let name = typeof req.body.name === "string" ? req.body.name.trim().slice(0, 100) : "访客";
    if (req.user?.id) {
      const user = await User.findByPk(req.user.id, { attributes: ["nickname"] });
      name = user?.nickname || name;
    }
    const existing = await CommentLike.findOne({ where: { commentId: comment.id, ...identity } });
    const liked = existing ? existing.status === "unlike" : true;
    if (existing) {
      await existing.update({ status: liked ? "like" : "unlike", name });
    } else {
      try {
        await CommentLike.create({ commentId: comment.id, name, ...identity, status: "like" });
      } catch (err: any) {
        // 并发双击：findOne 与 create 之间另一请求插入了同维度记录，撞互斥唯一索引
        if (err?.name !== "SequelizeUniqueConstraintError") throw err;
        const raced = await CommentLike.findOne({ where: { commentId: comment.id, ...identity } });
        if (raced) {
          const newStatus = raced.status === "like" ? "unlike" : "like";
          await raced.update({ status: newStatus, name });
        }
      }
    }
    const likeCount = await CommentLike.count({ where: { commentId: comment.id, status: "like" } });
    res.json({ liked, likeCount });
  }
);

function formatCatalog(categories: any[]) {
  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      intro: category.intro,
      sortOrder: category.sortOrder,
      items: (category.items || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        configuration: item.configuration,
        description: item.description,
        imageMediaId: item.imageMediaId,
        imageUrl: item.imageMedia?.url || item.imageUrl || "",
        linkUrl: item.linkUrl || "",
        sortOrder: item.sortOrder,
      })),
    })),
  };
}

async function findCatalog(collection: CatalogCollection) {
  return CatalogCategory.findAll({
    where: { collection },
    include: [{ model: CatalogItem, as: "items", include: [{ model: Media, as: "imageMedia", attributes: ["id", "url", "mimeType"] }] }],
    order: [["sortOrder", "ASC"], ["createdAt", "ASC"], [{ model: CatalogItem, as: "items" }, "sortOrder", "ASC"]],
  }) as any;
}

router.get("/catalog/:collection", async (req: Request, res: Response) => {
  const collection = collectionFrom(req.params.collection);
  if (!collection) {
    res.status(404).json({ message: "目录不存在" });
    return;
  }
  res.json(formatCatalog(await findCatalog(collection)));
});

router.get("/admin/catalog/:collection", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const collection = collectionFrom(req.params.collection);
  if (!collection) {
    res.status(404).json({ message: "目录不存在" });
    return;
  }
  res.json(formatCatalog(await findCatalog(collection)));
});

router.post(
  "/admin/catalog/:collection/categories",
  authenticate,
  requireAdmin,
  [body("name").trim().isLength({ min: 1, max: 100 }), body("intro").optional().isString().isLength({ max: 2000 })],
  async (req: AuthRequest, res: Response) => {
    if (!ensureValid(req, res)) return;
    const collection = collectionFrom(req.params.collection);
    if (!collection) {
      res.status(404).json({ message: "目录不存在" });
      return;
    }
    const sortOrder = await CatalogCategory.count({ where: { collection } });
    const category = await CatalogCategory.create({ collection, name: req.body.name, intro: req.body.intro || "", sortOrder });
    void triggerRevalidate();
    res.status(201).json(category);
  }
);

router.put(
  "/admin/catalog/:collection/categories/:id",
  authenticate,
  requireAdmin,
  [param("id").isUUID(), body("name").optional().trim().isLength({ min: 1, max: 100 }), body("intro").optional().isString().isLength({ max: 2000 }), body("sortOrder").optional().isInt({ min: 0, max: 10_000 })],
  async (req: AuthRequest, res: Response) => {
    if (!ensureValid(req, res)) return;
    const collection = collectionFrom(req.params.collection);
    const category = collection ? await CatalogCategory.findOne({ where: { id: req.params.id, collection } }) : null;
    if (!category) {
      res.status(404).json({ message: "分类不存在" });
      return;
    }
    await category.update({ ...("name" in req.body ? { name: req.body.name } : {}), ...("intro" in req.body ? { intro: req.body.intro } : {}), ...("sortOrder" in req.body ? { sortOrder: req.body.sortOrder } : {}) });
    void triggerRevalidate();
    res.json(category);
  }
);

router.delete("/admin/catalog/:collection/categories/:id", authenticate, requireAdmin, param("id").isUUID(), async (req: AuthRequest, res: Response) => {
  if (!ensureValid(req, res)) return;
  const collection = collectionFrom(req.params.collection);
  const category = collection ? await CatalogCategory.findOne({ where: { id: req.params.id, collection } }) : null;
  if (!category) {
    res.status(404).json({ message: "分类不存在" });
    return;
  }
  await category.destroy();
  void triggerRevalidate();
  res.status(204).send();
});

async function validateExternalUrl(value: unknown, label: string, maxLength: number) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > maxLength) throw new Error(`${label}无效`);
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label}必须是有效的 HTTPS 地址`);
  }
}

async function validateImageMedia(id: unknown, userId: string) {
  if (id == null || id === "") return null;
  if (typeof id !== "string") throw new Error("图片无效");
  const media = await Media.findOne({ where: { id, uploaderId: userId, storageType: "r2" } });
  if (!media || !media.mimeType.startsWith("image/")) throw new Error("图片必须是本人上传的 R2 图片");
  return media.id;
}

router.post(
  "/admin/catalog/:collection/items",
  authenticate,
  requireAdmin,
  [
    param("collection").isIn(["equipment", "labs"]),
    body("categoryId").isUUID(),
    body("title").trim().isLength({ min: 1, max: 200 }),
    body("configuration").optional().isString().isLength({ max: 300 }),
    body("description").optional().isString().isLength({ max: 5000 }),
    body("imageMediaId").optional({ nullable: true }).isUUID(),
    body("imageUrl").optional().isString().isLength({ max: 500 }),
    body("linkUrl").optional().isString().isLength({ max: 2048 }),
  ],
  async (req: AuthRequest, res: Response) => {
    if (!ensureValid(req, res)) return;
    const collection = collectionFrom(req.params.collection)!;
    const category = await CatalogCategory.findOne({ where: { id: req.body.categoryId, collection } });
    if (!category) {
      res.status(400).json({ message: "分类不存在或不属于当前目录" });
      return;
    }
    try {
      const imageUrl = await validateExternalUrl(req.body.imageUrl, "图片地址", 500);
      if (imageUrl && req.body.imageMediaId) throw new Error("图片地址和媒体库图片不能同时设置");
      const imageMediaId = imageUrl ? null : await validateImageMedia(req.body.imageMediaId, req.user!.id);
      const linkUrl = collection === "labs" ? await validateExternalUrl(req.body.linkUrl, "项目链接", 2048) : "";
      const sortOrder = await CatalogItem.count({ where: { categoryId: category.id } });
      const item = await CatalogItem.create({ categoryId: category.id, title: req.body.title, configuration: req.body.configuration || "", description: req.body.description || "", imageMediaId, imageUrl, linkUrl, sortOrder });
      void triggerRevalidate();
      res.status(201).json(item);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "保存失败" });
    }
  }
);

router.put(
  "/admin/catalog/:collection/items/:id",
  authenticate,
  requireAdmin,
  [
    param("id").isUUID(),
    body("title").optional().trim().isLength({ min: 1, max: 200 }),
    body("configuration").optional().isString().isLength({ max: 300 }),
    body("description").optional().isString().isLength({ max: 5000 }),
    body("imageMediaId").optional({ nullable: true }).isUUID(),
    body("imageUrl").optional().isString().isLength({ max: 500 }),
    body("linkUrl").optional().isString().isLength({ max: 2048 }),
    body("sortOrder").optional().isInt({ min: 0, max: 10_000 }),
  ],
  async (req: AuthRequest, res: Response) => {
    if (!ensureValid(req, res)) return;
    const collection = collectionFrom(req.params.collection);
    const item = collection ? await CatalogItem.findOne({ include: [{ model: CatalogCategory, as: "category", where: { collection } }], where: { id: req.params.id } }) : null;
    if (!item) {
      res.status(404).json({ message: "卡片不存在" });
      return;
    }
    try {
      const requestedImageUrl = "imageUrl" in req.body ? await validateExternalUrl(req.body.imageUrl, "图片地址", 500) : item.imageUrl;
      if (requestedImageUrl && req.body.imageMediaId) throw new Error("图片地址和媒体库图片不能同时设置");
      const imageMediaId = requestedImageUrl
        ? null
        : "imageMediaId" in req.body
          ? await validateImageMedia(req.body.imageMediaId, req.user!.id)
          : item.imageMediaId;
      const imageUrl = imageMediaId ? "" : requestedImageUrl;
      const linkUrl = collection === "labs"
        ? ("linkUrl" in req.body ? await validateExternalUrl(req.body.linkUrl, "项目链接", 2048) : item.linkUrl)
        : "";
      await item.update({ ...("title" in req.body ? { title: req.body.title } : {}), ...("configuration" in req.body ? { configuration: req.body.configuration } : {}), ...("description" in req.body ? { description: req.body.description } : {}), imageMediaId, imageUrl, linkUrl, ...("sortOrder" in req.body ? { sortOrder: req.body.sortOrder } : {}) });
      void triggerRevalidate();
      res.json(item);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "保存失败" });
    }
  }
);

router.delete("/admin/catalog/:collection/items/:id", authenticate, requireAdmin, param("id").isUUID(), async (req: AuthRequest, res: Response) => {
  if (!ensureValid(req, res)) return;
  const collection = collectionFrom(req.params.collection);
  const item = collection ? await CatalogItem.findOne({ include: [{ model: CatalogCategory, as: "category", where: { collection } }], where: { id: req.params.id } }) : null;
  if (!item) {
    res.status(404).json({ message: "卡片不存在" });
    return;
  }
  await item.destroy();
  void triggerRevalidate();
  res.status(204).send();
});

export default router;
