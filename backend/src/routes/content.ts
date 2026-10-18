import { Router, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { fn, col, Op } from "sequelize";
import {
  Comment,
  CommentLike,
  ContentPage,
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

const router = Router();

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

export default router;
