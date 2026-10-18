import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { body, param, validationResult } from "express-validator";
import { Op, fn, col } from "sequelize";
import sequelize from "../config/database";
import { User, Post, Comment, Like, CommentLike, SiteSetting } from "../models";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { blacklistService } from "../services/blacklist-service";
import { siteSettingTextDefaults } from "../models/SiteSetting";
import { stripMarkdownAndFrontmatter } from "./posts";
import { generateShortId } from "../utils/short-id";
import { triggerRevalidate } from "../utils/revalidate";
import { isValidHttpUrl, isValidImageUrl, normalizeHttpUrl, normalizeImageUrl } from "../utils/web-url";

const router = Router();

// GET /api/admin/dashboard - dashboard stats
// 返回：users/posts(moments)/articles/comments/likes 总数 + 近7天 timeSeries + recentPosts + recentComments
router.get("/dashboard", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const [users, moments, articles, draftArticles, comments, likes] = await Promise.all([
    User.count(),
    Post.count({ where: { type: "moment" } }),
    Post.count({ where: { type: "article" } }),
    Post.count({ where: { type: "article", status: "draft" } }),
    Comment.count(),
    Like.count(),
  ]);

  // 近 7 天每天的活动趋势（含今天），用 raw SQL 一次性生成日期序列再 LEFT JOIN
  // 避免"某天无活动"导致日期缺失
  const [timeSeriesRows] = await sequelize.query(`
    SELECT
      d.date,
      (SELECT COUNT(*) FROM posts    WHERE DATE(created_at) = d.date AND type = 'moment')  AS moments,
      (SELECT COUNT(*) FROM posts    WHERE DATE(created_at) = d.date AND type = 'article') AS articles,
      (SELECT COUNT(*) FROM comments WHERE DATE(created_at) = d.date)              AS comments,
      (SELECT COUNT(*) FROM likes    WHERE DATE(created_at) = d.date)              AS likes
    FROM (
      SELECT CURDATE() - INTERVAL n DAY AS date
      FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) nums
    ) d
    ORDER BY d.date ASC
  `);

  const timeSeries = (timeSeriesRows as any[]).map((r) => {
    const d = new Date(r.date);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    return {
      date: typeof r.date === "string" ? r.date : new Date(r.date).toISOString().slice(0, 10),
      label,
      posts: Number(r.moments) || 0,
      articles: Number(r.articles) || 0,
      comments: Number(r.comments) || 0,
      likes: Number(r.likes) || 0,
    };
  });

  // 最近 6 篇编辑或发表的文章（用于作者工作台直达编辑）
  const recentArticleRows = await Post.findAll({
    where: { type: "article" },
    attributes: ["id", "shortId", "title", "excerpt", "category", "cover", "status", "pinned", "createdAt", "updatedAt"],
    order: [["updatedAt", "DESC"]],
    limit: 6,
  });
  const recentArticles = recentArticleRows.map((a: any) => ({
    id: a.id,
    shortId: a.shortId,
    title: a.title || "无标题文章",
    excerpt: a.excerpt ? stripMarkdownAndFrontmatter(a.excerpt).slice(0, 80) : "",
    category: a.category || "随笔",
    cover: a.cover || "",
    status: a.status || "published",
    pinned: !!a.pinned,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));

  // 最近 5 条动态（含作者昵称、内容前 100 字、是否置顶）
  const recentPostRows = await Post.findAll({
    include: [{ model: User, as: "author", attributes: ["nickname"] }],
    order: [["createdAt", "DESC"]],
    limit: 5,
  });
  const recentPosts = recentPostRows.map((p: any) => ({
    id: p.id,
    content: (p.content || "").replace(/<[^>]+>/g, "").slice(0, 100),
    createdAt: p.createdAt,
    pinned: !!p.pinned,
    author: p.author?.nickname || "",
  }));

  // 最近 5 条评论（含所属动态作者和内容前 50 字）
  const recentCommentRows = await Comment.findAll({
    include: [{
      model: Post,
      as: "post",
      attributes: ["id", "content"],
      required: false,
      include: [{ model: User, as: "author", attributes: ["nickname"] }],
    }],
    order: [["createdAt", "DESC"]],
    limit: 5,
  });
  const recentComments = recentCommentRows.map((c: any) => ({
    id: c.id,
    author: c.authorName,
    content: (c.content || "").slice(0, 200),
    createdAt: c.createdAt,
    postAuthor: c.post?.author?.nickname || "",
    postContent: c.post ? (c.post.content || "").replace(/<[^>]+>/g, "").slice(0, 50) : "",
  }));

  res.json({
    users,
    posts: moments,
    articles,
    draftArticles,
    recentArticles,
    comments,
    likes,
    timeSeries,
    recentPosts,
    recentComments,
  });
});

// GET /api/admin/me - 获取当前登录管理员自己的资料
router.get("/me", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const user = await User.findByPk(req.user!.id, {
    attributes: ["id", "email", "username", "nickname", "avatar", "cover", "bio", "website", "role", "createdAt"],
  });
  if (!user) {
    res.status(404).json({ message: "未找到博主账号" });
    return;
  }
  res.json(user);
});

// GET /api/admin/users - list users
router.get("/users", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const users = await User.findAll({
    attributes: ["id", "email", "username", "nickname", "avatar", "cover", "bio", "website", "role", "createdAt"],
    // 管理员排前，优先返回早期创建的主博主账号，绝不让新创建的访客排在首位
    order: [
      ["role", "ASC"], // 'admin' < 'visitor'
      ["createdAt", "ASC"],
    ],
  });
  res.json(users);
});

function tryParseJson<T>(val: any, fallback: T): T {
  if (typeof val !== "string") return val ?? fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// GET /api/admin/posts - list posts for admin (includes drafts, optional type/category/status/keyword filter)
router.get("/posts", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where: any = {};
  const typeParam = req.query.type as string;
  if (typeParam === "article" || typeParam === "moment") {
    where.type = typeParam;
  }
  const categoryParam = req.query.category as string;
  if (categoryParam) {
    if (categoryParam === "岁岁念") {
      where[Op.or] = [
        { category: "岁岁念" },
        { category: "" },
        { category: { [Op.is]: null } },
      ];
    } else {
      where.category = categoryParam;
    }
  } else if (typeParam === "article") {
    // 后台文章页不应混入项目分类，否则前端分页后再过滤会造成总数和页码失真。
    where.category = { [Op.ne]: "项目" };
  }
  const statusParam = req.query.status as string;
  if (statusParam && (statusParam === "published" || statusParam === "draft")) {
    where.status = statusParam;
  }

  // 关键词检索（跨标题、摘要、分类搜索）
  const keyword = ((req.query.keyword || req.query.search) as string || "").trim();
  if (keyword) {
    const kw = `%${keyword}%`;
    const keywordWhere = [
      { title: { [Op.like]: kw } },
      { excerpt: { [Op.like]: kw } },
      { category: { [Op.like]: kw } },
    ];
    if (where[Op.or]) {
      where[Op.and] = [{ [Op.or]: where[Op.or] }, { [Op.or]: keywordWhere }];
      delete where[Op.or];
    } else {
      where[Op.or] = keywordWhere;
    }
  }

  // 排序支持：views(阅读最多), updated(最新修改), created_asc(最早发布), 默认 pinned 优先 + createdAt 倒序
  const sortByParam = req.query.sortBy as string;
  let order: any[] = [["pinned", "DESC"], ["createdAt", "DESC"]];
  if (sortByParam === "views") {
    order = [["pinned", "DESC"], ["viewCount", "DESC"], ["createdAt", "DESC"]];
  } else if (sortByParam === "updated") {
    order = [["pinned", "DESC"], ["updatedAt", "DESC"]];
  } else if (sortByParam === "created_asc") {
    order = [["pinned", "DESC"], ["createdAt", "ASC"]];
  }

  const { count, rows: posts } = await Post.findAndCountAll({
    where,
    include: [{ model: User, as: "author", attributes: ["id", "nickname", "avatar"] }],
    order,
    limit,
    offset,
    distinct: true,
  });

  const postIds = posts.map((p: any) => p.id);

  // 批量查出当前页文章的评论数与点赞数
  const commentCountsMap = new Map<string, number>();
  const likeCountsMap = new Map<string, number>();
  if (postIds.length > 0) {
    const [commentCounts, likeCounts] = await Promise.all([
      Comment.findAll({
        where: { postId: { [Op.in]: postIds } },
        attributes: ["postId", [fn("COUNT", col("id")), "count"]],
        group: ["postId"],
        raw: true,
      }) as Promise<any[]>,
      Like.findAll({
        where: { postId: { [Op.in]: postIds } },
        attributes: ["postId", [fn("COUNT", col("id")), "count"]],
        group: ["postId"],
        raw: true,
      }) as Promise<any[]>,
    ]);
    for (const row of commentCounts) {
      commentCountsMap.set(row.postId, Number(row.count) || 0);
    }
    for (const row of likeCounts) {
      likeCountsMap.set(row.postId, Number(row.count) || 0);
    }
  }

  // 查出所有关联的合辑标题
  const colTitlesMap = new Map<string, string>();
  const postsWithCol = posts.filter((p: any) => p.collectionId);
  if (postsWithCol.length > 0) {
    const colIds = Array.from(new Set(postsWithCol.map((p: any) => p.collectionId)));
    const cols = await Post.findAll({ where: { id: { [Op.in]: colIds } }, attributes: ["id", "title"] });
    for (const c of cols) colTitlesMap.set(c.id, c.title);
  }

  res.json({
    data: posts.map((p: any) => ({
      id: p.id,
      shortId: p.shortId,
      type: p.type || "moment",
      title: p.title || "",
      excerpt: p.excerpt ? stripMarkdownAndFrontmatter(p.excerpt) : "",
      cover: p.cover || "",
      category: p.category || "",
      content: p.type === "article" ? stripMarkdownAndFrontmatter(p.content || "").slice(0, 200) : (p.content || ""),
      articleType: p.articleType || "original",
      repostUrl: p.repostUrl || "",
      linkCard: tryParseJson(p.linkCard, null),
      images: tryParseJson(p.images, []),
      location: tryParseJson(p.location, null),
      music: tryParseJson(p.music, null),
      video: tryParseJson(p.video, null),
      douban: tryParseJson(p.douban, null),
      likesDisabled: !!p.likesDisabled,
      commentsDisabled: !!p.commentsDisabled,
      pinned: !!p.pinned,
      status: p.status || "published",
      viewCount: Number(p.viewCount) || 0,
      commentCount: commentCountsMap.get(p.id) || 0,
      likeCount: likeCountsMap.get(p.id) || 0,
      collectionId: p.collectionId || null,
      collectionTitle: p.collectionId ? (colTitlesMap.get(p.collectionId) || "已加入合辑") : null,
      hideInHome: !!p.hideInHome,
      collectionPostIds: tryParseJson(p.collectionPostIds, null),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      author: p.author?.nickname || "",
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  });
});

// GET /api/admin/posts/categories - 获取所有已有文章分类列表
router.get("/posts/categories", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const rows = (await Post.findAll({
      where: {
        type: "article",
        category: {
          [Op.and]: [
            { [Op.ne]: "" },
            { [Op.ne]: "项目" },
            { [Op.ne]: null as any },
          ],
        },
      },
      attributes: [[fn("DISTINCT", col("category")), "category"]],
      raw: true,
    })) as any[];
    const categories = rows
      .map((r: any) => (typeof r.category === "string" ? r.category.trim() : ""))
      .filter((c: string) => c && c !== "项目");
    res.json({ categories: Array.from(new Set(categories)) });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "获取分类失败" });
  }
});

// POST /api/admin/posts/batch-delete - 批量彻底删除文章
router.post(
  "/posts/batch-delete",
  authenticate,
  requireAdmin,
  [body("ids").isArray({ min: 1, max: 100 }).withMessage("请选择 1~100 篇要删除的内容")],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ message: errors.array()[0]?.msg || "参数校验失败" });
      return;
    }
    const rawIds: string[] = req.body.ids;
    const ids = Array.from(new Set(rawIds.map((id) => String(id).trim()).filter(Boolean)));
    if (ids.length === 0) {
      res.status(400).json({ message: "文章 ID 列表不能为空" });
      return;
    }

    try {
      const deletedCount = await sequelize.transaction(async (transaction) => {
        const posts = await Post.findAll({
          where: { id: { [Op.in]: ids } },
          attributes: ["id", "type", "collectionId", "collectionPostIds"],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (posts.length === 0) return 0;
        const targetIds = posts.map((p) => p.id);

        // 1. 查找并清理关联评论及评论点赞
        const comments = await Comment.findAll({
          where: { postId: { [Op.in]: targetIds } },
          attributes: ["id"],
          transaction,
        });
        const commentIds = comments.map((c) => c.id);
        if (commentIds.length > 0) {
          await CommentLike.destroy({ where: { commentId: { [Op.in]: commentIds } }, transaction });
          await Comment.destroy({ where: { id: { [Op.in]: commentIds } }, transaction });
        }

        // 2. 清理文章点赞
        await Like.destroy({ where: { postId: { [Op.in]: targetIds } }, transaction });

        // 3. 处理合辑关联
        for (const post of posts) {
          if (post.type === "collection") {
            // 合辑被删：解绑其子文章
            await Post.update(
              { collectionId: null, hideInHome: false },
              { where: { collectionId: post.id }, transaction }
            );
          } else if (post.collectionId) {
            // 子文章被删：从父合辑列表中剔除
            const parentCol = await Post.findOne({
              where: { id: post.collectionId, type: "collection" },
              transaction,
              lock: transaction.LOCK.UPDATE,
            });
            if (parentCol) {
              const curIds = tryParseJson<string[]>(parentCol.collectionPostIds, []);
              const newIds = curIds.filter((cid) => cid !== post.id);
              await parentCol.update({ collectionPostIds: newIds }, { transaction });
            }
          }
        }

        // 4. 彻底删除文章记录
        return await Post.destroy({
          where: { id: { [Op.in]: targetIds } },
          transaction,
        });
      });

      triggerRevalidate(["/", "/articles"]).catch(() => {});
      res.json({ message: `成功删除 ${deletedCount} 篇内容`, count: deletedCount });
    } catch (err: any) {
      console.error("批量删除失败:", err);
      res.status(500).json({ message: err.message || "批量删除失败" });
    }
  }
);

// PATCH /api/admin/posts/batch-status - 批量切换发布/草稿状态
router.patch(
  "/posts/batch-status",
  authenticate,
  requireAdmin,
  [
    body("ids").isArray({ min: 1, max: 100 }).withMessage("请选择 1~100 篇内容"),
    body("status").isIn(["published", "draft"]).withMessage("状态必须为 published 或 draft"),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ message: errors.array()[0]?.msg || "参数校验失败" });
      return;
    }
    const { ids: rawIds, status } = req.body;
    const ids = Array.from(new Set((rawIds as any[]).map((id) => String(id).trim()).filter(Boolean)));
    if (ids.length === 0) {
      res.status(400).json({ message: "文章 ID 列表不能为空" });
      return;
    }

    try {
      const updatedCount = await sequelize.transaction(async (transaction) => {
        if (status === "draft") {
          // 若下架转为草稿，若文章已加入合辑，则移出合辑
          const posts = await Post.findAll({
            where: { id: { [Op.in]: ids }, collectionId: { [Op.ne]: null } },
            attributes: ["id", "collectionId"],
            transaction,
          });
          for (const p of posts) {
            if (p.collectionId) {
              const parentCol = await Post.findOne({
                where: { id: p.collectionId, type: "collection" },
                transaction,
              });
              if (parentCol) {
                const curIds = tryParseJson<string[]>(parentCol.collectionPostIds, []);
                await parentCol.update(
                  { collectionPostIds: curIds.filter((cid) => cid !== p.id) },
                  { transaction }
                );
              }
            }
          }
          const [cnt] = await Post.update(
            { status: "draft", collectionId: null, hideInHome: false },
            { where: { id: { [Op.in]: ids } }, transaction }
          );
          return cnt;
        }

        const [cnt] = await Post.update(
          { status: "published" },
          { where: { id: { [Op.in]: ids } }, transaction }
        );
        return cnt;
      });

      triggerRevalidate(["/", "/articles"]).catch(() => {});
      res.json({
        message: `成功将 ${updatedCount} 篇内容状态切换为「${status === "published" ? "已发布" : "草稿"}」`,
        count: updatedCount,
      });
    } catch (err: any) {
      console.error("批量切换状态失败:", err);
      res.status(500).json({ message: err.message || "批量切换状态失败" });
    }
  }
);

// PATCH /api/admin/posts/batch-category - 批量修改分类
router.patch(
  "/posts/batch-category",
  authenticate,
  requireAdmin,
  [
    body("ids").isArray({ min: 1, max: 100 }).withMessage("请选择 1~100 篇内容"),
    body("category").trim().notEmpty().withMessage("分类不能为空").isLength({ max: 50 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ message: errors.array()[0]?.msg || "参数校验失败" });
      return;
    }
    const { ids: rawIds, category } = req.body;
    const ids = Array.from(new Set((rawIds as any[]).map((id) => String(id).trim()).filter(Boolean)));
    if (ids.length === 0) {
      res.status(400).json({ message: "文章 ID 列表不能为空" });
      return;
    }

    try {
      const [updatedCount] = await Post.update(
        { category: category.trim() },
        { where: { id: { [Op.in]: ids } } }
      );

      triggerRevalidate(["/", "/articles"]).catch(() => {});
      res.json({
        message: `成功将 ${updatedCount} 篇文章修改为分类「${category.trim()}」`,
        count: updatedCount,
      });
    } catch (err: any) {
      console.error("批量修改分类失败:", err);
      res.status(500).json({ message: err.message || "批量修改分类失败" });
    }
  }
);

// GET /api/admin/collections - 获取所有合辑列表
router.get("/collections", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const collections = await Post.findAll({
      where: { type: "collection" },
      order: [["pinned", "DESC"], ["createdAt", "DESC"]],
      include: [{ model: User, as: "author", attributes: ["id", "nickname", "avatar"] }],
    });

    const allChildIds = Array.from(
      new Set(
        collections.flatMap((c: any) => {
          const ids = tryParseJson<string[]>(c.collectionPostIds, []);
          return Array.isArray(ids) ? ids : [];
        })
      )
    );

    const childArticles = allChildIds.length > 0
      ? await Post.findAll({
          where: { id: { [Op.in]: allChildIds } },
          attributes: ["id", "shortId", "title", "excerpt", "cover", "category", "status", "viewCount", "createdAt"],
        })
      : [];
    const childMap = new Map(childArticles.map((a: any) => [a.id, a]));

    const result = collections.map((c: any) => {
      const ids = tryParseJson<string[]>(c.collectionPostIds, []);
      const articles = (Array.isArray(ids) ? ids : []).map((id: string) => childMap.get(id)).filter(Boolean);
      return {
        id: c.id,
        shortId: c.shortId,
        title: c.title,
        excerpt: c.excerpt,
        cover: c.cover,
        pinned: !!c.pinned,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        postIds: Array.isArray(ids) ? ids : [],
        articleCount: articles.length,
        articles,
      };
    });

    res.json({ data: result });
  } catch (err: any) {
    console.error("获取合辑列表失败:", err);
    res.status(500).json({ message: err.message || "获取合辑列表失败" });
  }
});

// POST /api/admin/collections - 创建合辑
router.post(
  "/collections",
  authenticate,
  requireAdmin,
  [
    body("title").trim().notEmpty().withMessage("合辑名称不能为空").isLength({ max: 200 }),
    body("excerpt").optional().trim().isLength({ max: 500 }),
    body("cover")
      .optional()
      .trim()
      .isLength({ max: 512 })
      .custom(isValidImageUrl)
      .withMessage("封面地址格式无效"),
    body("pinned").optional().isBoolean(),
    body("postIds").isArray({ min: 1 }).withMessage("请至少选择一篇文章加入合辑"),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array(), message: errors.array()[0]?.msg || "参数验证失败" });
      return;
    }

    try {
      const { title, excerpt = "", cover = "", pinned = false, postIds } = req.body;
      const userId = req.user!.id;
      const normalizedPostIds: string[] = Array.from(
        new Set<string>(
          (Array.isArray(postIds) ? postIds : [])
            .map((id: unknown): string => String(id || "").trim())
            .filter(Boolean)
        )
      );

      if (normalizedPostIds.length === 0) {
        res.status(400).json({ message: "请至少选择一篇文章加入合辑" });
        return;
      }

      const collection = await sequelize.transaction(async (transaction) => {
        // 合辑会直接展示在首页，只允许未归入其他合辑的已发布文章加入。
        const posts = await Post.findAll({
          where: {
            id: { [Op.in]: normalizedPostIds },
            type: "article",
            status: "published",
            category: { [Op.ne]: "项目" },
            collectionId: null,
          },
          attributes: ["id", "title", "cover", "excerpt"],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (posts.length !== normalizedPostIds.length) {
          throw Object.assign(new Error("只能选择未加入其他合辑的已发布文章"), { status: 400 });
        }

        // 封面默认取传参或第一篇选中有封面的文章
        let finalCover = cover ? (normalizeImageUrl(cover) || "") : "";
        if (!finalCover) {
          const firstWithCover = posts.find((p: any) => p.cover && p.cover.trim());
          finalCover = firstWithCover?.cover || "";
        }

        // 简介默认取传参或首篇文章摘要
        let finalExcerpt = excerpt;
        if (!finalExcerpt) {
          finalExcerpt = posts[0]?.excerpt || `包含《${posts[0]?.title}》等 ${posts.length} 篇精选系列文章`;
        }

        // 创建合辑类型的 Post 记录
        const shortId = await generateShortId();
        const createdCollection = await Post.create(
          {
            userId,
            shortId,
            type: "collection",
            title: title.trim(),
            excerpt: finalExcerpt.trim(),
            cover: finalCover,
            category: "合辑",
            content: "",
            images: [],
            location: null,
            music: null,
            linkCard: null,
            video: null,
            douban: null,
            pinned: !!pinned,
            likesDisabled: false,
            commentsDisabled: false,
            ip: "",
            region: "",
            articleType: "original",
            repostUrl: "",
            status: "published",
            hideInHome: false,
            collectionId: null,
            collectionPostIds: normalizedPostIds,
          },
          { transaction }
        );

        // 批量将选中的子文章标记为属于此合辑，且在首页普通流中隐藏
        await Post.update(
          { collectionId: createdCollection.id, hideInHome: true },
          { where: { id: { [Op.in]: normalizedPostIds } }, transaction }
        );

        return createdCollection;
      });

      triggerRevalidate(["/", "/articles"]).catch(() => {});

      res.status(201).json({
        message: "合辑创建成功",
        data: {
          id: collection.id,
          shortId: collection.shortId,
          title: collection.title,
          excerpt: collection.excerpt,
          cover: collection.cover,
          postIds: normalizedPostIds,
        },
      });
    } catch (err: any) {
      console.error("创建合辑失败:", err);
      res.status(err.status || 500).json({ message: err.message || "创建合辑失败" });
    }
  }
);

// PUT /api/admin/collections/:id - 更新合辑（修改标题、摘要、封面、增删子文章等）
router.put(
  "/collections/:id",
  authenticate,
  requireAdmin,
  [
    param("id").isUUID(),
    body("title").optional().trim().notEmpty().isLength({ max: 200 }),
    body("excerpt").optional().trim().isLength({ max: 500 }),
    body("cover")
      .optional()
      .trim()
      .isLength({ max: 512 })
      .custom(isValidImageUrl)
      .withMessage("封面地址格式无效"),
    body("pinned").optional().isBoolean(),
    body("postIds").optional().isArray(),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array(), message: errors.array()[0]?.msg || "参数验证失败" });
      return;
    }

    try {
      const collection = await sequelize.transaction(async (transaction) => {
        const target = await Post.findOne({
          where: { id: req.params.id, type: "collection" },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!target) {
          throw Object.assign(new Error("合辑不存在"), { status: 404 });
        }

        const { title, excerpt, cover, pinned, postIds } = req.body;
        const updates: any = {};
        if (title !== undefined) updates.title = title.trim();
        if (excerpt !== undefined) updates.excerpt = excerpt.trim();
        if (cover !== undefined) updates.cover = cover ? (normalizeImageUrl(cover) || "") : "";
        if (pinned !== undefined) updates.pinned = !!pinned;

        if (Array.isArray(postIds)) {
          const normalizedPostIds = Array.from(
            new Set<string>(
              postIds
                .map((id: unknown): string => String(id || "").trim())
                .filter(Boolean)
            )
          );

          if (normalizedPostIds.length > 0) {
            // 校验成员合法性：已发布、类型为文章、非项目、未归属于其他合辑
            const validPosts = await Post.findAll({
              where: {
                id: { [Op.in]: normalizedPostIds },
                type: "article",
                status: "published",
                category: { [Op.ne]: "项目" },
                [Op.or]: [
                  { collectionId: null },
                  { collectionId: target.id },
                ],
              },
              attributes: ["id"],
              transaction,
              lock: transaction.LOCK.UPDATE,
            });

            if (validPosts.length !== normalizedPostIds.length) {
              throw Object.assign(new Error("只能选择未加入其他合辑的已发布文章"), { status: 400 });
            }
          }

          updates.collectionPostIds = normalizedPostIds;
          const oldIds: string[] = tryParseJson<string[]>(target.collectionPostIds, []);
          const removedIds = oldIds.filter((id) => !normalizedPostIds.includes(id));
          const newIds = normalizedPostIds.filter((id) => !oldIds.includes(id));

          if (removedIds.length > 0) {
            await Post.update(
              { collectionId: null, hideInHome: false },
              { where: { id: { [Op.in]: removedIds }, collectionId: target.id }, transaction }
            );
          }
          if (newIds.length > 0) {
            await Post.update(
              { collectionId: target.id, hideInHome: true },
              { where: { id: { [Op.in]: newIds } }, transaction }
            );
          }

          // 成员有增减时刷新合辑时间
          if ((removedIds.length > 0 || newIds.length > 0) && !target.pinned) {
            updates.createdAt = new Date();
          }
        }

        await target.update(updates, { transaction });
        return target;
      });

      triggerRevalidate(["/", "/articles"]).catch(() => {});

      res.json({ message: "合辑更新成功", data: collection });
    } catch (err: any) {
      console.error("更新合辑失败:", err);
      res.status(err.status || 500).json({ message: err.message || "更新合辑失败" });
    }
  }
);

// DELETE /api/admin/collections/:id - 解散合辑
router.delete(
  "/collections/:id",
  authenticate,
  requireAdmin,
  [param("id").isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      await sequelize.transaction(async (transaction) => {
        const collection = await Post.findOne({
          where: { id: req.params.id, type: "collection" },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!collection) {
          throw Object.assign(new Error("合辑不存在"), { status: 404 });
        }

        // 将归属于该合辑的所有文章全部恢复独立显示
        await Post.update(
          { collectionId: null, hideInHome: false },
          { where: { collectionId: collection.id }, transaction }
        );

        // 删除合辑记录
        await collection.destroy({ transaction });
      });

      triggerRevalidate(["/", "/articles"]).catch(() => {});

      res.json({ message: "合辑已成功解散，所有文章已恢复在首页独立展示" });
    } catch (err: any) {
      console.error("解散合辑失败:", err);
      res.status(err.status || 500).json({ message: err.message || "解散合辑失败" });
    }
  }
);

// POST /api/admin/collections/:id/remove-post - 将某单篇文章移出合辑
router.post(
  "/collections/:id/remove-post",
  authenticate,
  requireAdmin,
  [param("id").isUUID(), body("postId").isUUID().withMessage("文章 ID 格式无效")],
  async (req: AuthRequest, res: Response) => {
    try {
      await sequelize.transaction(async (transaction) => {
        const collection = await Post.findOne({
          where: { id: req.params.id, type: "collection" },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!collection) {
          throw Object.assign(new Error("合辑不存在"), { status: 404 });
        }

        const { postId } = req.body;
        const oldIds: string[] = tryParseJson<string[]>(collection.collectionPostIds, []);
        const newIds = oldIds.filter((id) => id !== postId);
        await collection.update({ collectionPostIds: newIds }, { transaction });

        await Post.update(
          { collectionId: null, hideInHome: false },
          { where: { id: postId, collectionId: collection.id }, transaction }
        );
      });

      triggerRevalidate(["/", "/articles"]).catch(() => {});

      res.json({ message: "文章已成功移出合辑，将在首页恢复独立展示" });
    } catch (err: any) {
      console.error("移出合辑失败:", err);
      res.status(err.status || 500).json({ message: err.message || "移出合辑失败" });
    }
  }
);

// PUT /api/admin/users/:id - update user (admin only)
router.put(
  "/users/:id",
  authenticate,
  requireAdmin,
  [
    body("nickname").optional().trim().isLength({ min: 1, max: 100 }),
    body("bio").optional().trim().isLength({ max: 255 }),
    body("website")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .custom(isValidHttpUrl)
      .withMessage("网站地址格式无效"),
    body("avatar")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .custom(isValidImageUrl)
      .withMessage("头像地址格式无效"),
    body("cover")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .custom(isValidImageUrl)
      .withMessage("封面地址格式无效"),
    body("email").optional().trim().isEmail().normalizeEmail(),
    body("username")
      .optional()
      .trim()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9_]+$/),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = await User.findByPk(req.params.id as string);
    if (!user) {
      res.status(404).json({ message: "用户不存在" });
      return;
    }

    // Check email uniqueness if changing
    if (req.body.email && req.body.email !== user.email) {
      const existing = await User.findOne({ where: { email: req.body.email } });
      if (existing) {
        res.status(409).json({ message: "该邮箱已被使用" });
        return;
      }
    }

    // Check username uniqueness if changing
    if (req.body.username && req.body.username !== user.username) {
      const existing = await User.findOne({ where: { username: req.body.username } });
      if (existing) {
        res.status(409).json({ message: "该用户名已被使用" });
        return;
      }
    }

    await user.update({
      nickname: req.body.nickname !== undefined ? req.body.nickname.trim() : user.nickname,
      bio: req.body.bio !== undefined ? req.body.bio.trim() : user.bio,
      website: req.body.website !== undefined ? (req.body.website ? normalizeHttpUrl(req.body.website) || "" : "") : user.website,
      avatar: req.body.avatar !== undefined ? (req.body.avatar ? normalizeImageUrl(req.body.avatar) || "" : "") : user.avatar,
      cover: req.body.cover !== undefined ? (req.body.cover ? normalizeImageUrl(req.body.cover) || "" : "") : user.cover,
      email: req.body.email ?? user.email,
      username: req.body.username ?? user.username,
    });

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      cover: user.cover,
      bio: user.bio,
      website: user.website,
      role: user.role,
    });
  }
);

// POST /api/admin/change-password - change own password
router.post(
  "/change-password",
  authenticate,
  requireAdmin,
  [
    body("oldPassword").isLength({ min: 1 }),
    body("newPassword").isLength({ min: 6 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ message: "用户不存在" });
      return;
    }

    const valid = await bcrypt.compare(req.body.oldPassword, user.password);
    if (!valid) {
      res.status(401).json({ message: "原密码错误" });
      return;
    }

    user.password = await bcrypt.hash(req.body.newPassword, 10);
    await user.save();

    res.json({ message: "密码修改成功" });
  }
);

// 管理端评论响应，供列表与编辑成功响应共用，避免字段漂移。
function formatAdminComment(c: any) {
  return {
    id: c.id,
    author: c.authorName,
    email: c.email,
    website: c.website,
    content: c.content,
    replyTo: c.replyTo,
    replyToId: c.replyToId,
    region: c.region || "",
    createdAt: c.createdAt,
    post: c.post
      ? {
          id: c.post.id,
          content: c.post.content?.slice(0, 50) || "",
          author: c.post.author?.nickname || "",
        }
      : null,
  };
}

// GET /api/admin/comments - list all comments with post info
router.get("/comments", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const comments = await Comment.findAll({
    include: [
      {
        model: Post,
        as: "post",
        attributes: ["id", "content"],
        include: [
          { model: User, as: "author", attributes: ["nickname"] },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  res.json(comments.map(formatAdminComment));
});


// PUT /api/admin/comments/:id - edit a comment (admin only)
router.put(
  "/comments/:id",
  authenticate,
  requireAdmin,
  [
    param("id").isUUID(),
    body("author").trim().isLength({ min: 1, max: 100 }),
    body("email").optional({ checkFalsy: true }).trim().isEmail().normalizeEmail(),
    body("website").optional({ nullable: true }).trim().isLength({ max: 255 }).custom(isValidHttpUrl),
    body("content").trim().isLength({ min: 1, max: 10000 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const comment = await Comment.findByPk(req.params.id as string, {
      include: [{
        model: Post,
        as: "post",
        attributes: ["id", "content"],
        include: [{ model: User, as: "author", attributes: ["nickname"] }],
      }],
    });
    if (!comment) {
      res.status(404).json({ message: "评论不存在" });
      return;
    }

    await comment.update({
      authorName: req.body.author.trim(),
      email: req.body.email?.trim().toLowerCase() || "",
      website: normalizeHttpUrl(req.body.website) || "",
      content: req.body.content.trim(),
    });

    res.json(formatAdminComment(comment));
  }
);

// DELETE /api/admin/comments/:id - delete a comment
router.delete(
  "/comments/:id",
  authenticate,
  requireAdmin,
  param("id").isUUID(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const comment = await Comment.findByPk(req.params.id as string);
      if (!comment) {
        res.status(404).json({ message: "评论不存在" });
        return;
      }

      const commentId = comment.id;
      // 1. 级联清理该评论的点赞
      await CommentLike.destroy({ where: { commentId } }).catch(() => {});
      // 2. 解除针对该评论的子回复外键引用
      await Comment.update({ replyToId: null as any }, { where: { replyToId: commentId } }).catch(() => {});
      // 3. 彻底删除评论
      await comment.destroy();

      res.status(204).send();
    } catch (err: any) {
      console.error("[delete comment error]:", err);
      res.status(500).json({ message: err.message || "删除评论失败" });
    }
  }
);

// ============ 黑名单管理 ============

// GET /api/admin/blacklist - 列出所有黑名单（含已过期，前端可筛选）
router.get("/blacklist", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const list = await blacklistService.list();
  res.json(
    list.map((b) => ({
      id: b.id,
      type: b.type,
      value: b.value,
      reason: b.reason,
      expiresAt: b.expiresAt,
      createdAt: b.createdAt,
    }))
  );
});

// GET /api/admin/blacklist/status - 获取评论防刷总开关状态
router.get("/blacklist/status", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const enabled = await blacklistService.isAntiSpamEnabled();
  res.json({ enabled });
});

// PUT /api/admin/blacklist/status - 切换评论防刷总开关
router.put(
  "/blacklist/status",
  authenticate,
  requireAdmin,
  body("enabled").isBoolean(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    await blacklistService.setAntiSpamEnabled(req.body.enabled);
    res.json({ enabled: req.body.enabled });
  }
);

// POST /api/admin/blacklist - 添加封禁
// body: { type: 'email'|'ip', value, reason?, durationMs?: number|null }
// durationMs=null 或不传 → 永久；数字 → 毫秒后过期
router.post(
  "/blacklist",
  authenticate,
  requireAdmin,
  [
    body("type").isIn(["email", "ip"]),
    body("value").trim().isLength({ min: 1, max: 255 }),
    body("reason").optional().trim().isLength({ max: 255 }),
    body("durationMs").optional({ nullable: true }).isInt({ min: 60_000, max: 365 * 24 * 60 * 60 * 1000 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { type, value, reason, durationMs } = req.body;
    const record = await blacklistService.add(
      type,
      value,
      reason || null,
      durationMs === undefined ? null : Number(durationMs)
    );
    res.status(201).json({
      id: record.id,
      type: record.type,
      value: record.value,
      reason: record.reason,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    });
  }
);

// DELETE /api/admin/blacklist/:id - 移除封禁（解封）
router.delete(
  "/blacklist/:id",
  authenticate,
  requireAdmin,
  param("id").isUUID(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const ok = await blacklistService.remove(req.params.id as string);
    if (!ok) {
      res.status(404).json({ message: "黑名单记录不存在" });
      return;
    }
    res.status(204).send();
  }
);

// GET /api/admin/blacklist/banned-words - 获取违禁词列表
router.get("/blacklist/banned-words", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const setting = await SiteSetting.findByPk(1);
  let words: string[] = [];
  if (setting?.bannedWords) {
    try {
      words = JSON.parse(setting.bannedWords);
      if (!Array.isArray(words)) words = [];
    } catch {
      words = [];
    }
  }
  res.json({ words });
});

// PUT /api/admin/blacklist/banned-words - 更新违禁词列表
router.put(
  "/blacklist/banned-words",
  authenticate,
  requireAdmin,
  body("words").isArray(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const rawWords: string[] = req.body.words;
    const words = rawWords
      .map((w) => String(w).trim())
      .filter((w) => w.length > 0 && w.length <= 100)
      .slice(0, 500);
    const [setting] = await SiteSetting.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, ...siteSettingTextDefaults },
    });
    await setting.update({ bannedWords: JSON.stringify(words) });
    res.json({ words });
  }
);

export default router;
