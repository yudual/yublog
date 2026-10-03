/**
 * 媒体库路由
 * 提供媒体文件的列表、上传、删除功能。
 * 上传通过受控 R2 直传完成，并自动登记到 Media 表。
 */
import { Router, Request, Response } from "express";
import path from "path";
import { Op } from "sequelize";
import { param, validationResult } from "express-validator";
import { CatalogItem, Media, MusicTrack, Post, UploadIntent, User, getMediaCategory, sequelize, type MediaKind } from "../models";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { deleteStoredFile, isR2Ready } from "../services/storage-service";
import { DIRECT_UPLOAD_RULES, getDirectUploadRule } from "../utils/upload-rules";
import {
  buildObjectKey,
  buildStagingKey,
  createPresignedUploadForKey,
  deleteFromR2,
  downloadFromR2,
  extractR2Key,
  promoteR2Object,
  statR2Object,
  getR2PublicUrl,
} from "../services/r2-service";

const router = Router();

/** 格式化媒体记录为 API 响应 */
function formatMedia(media: any) {
  return {
    id: media.id,
    filename: media.filename,
    url: media.url,
    storageType: media.storageType,
    mimeType: media.mimeType,
    size: Number(media.size),
    category: getMediaCategory(media.mimeType),
    kind: media.kind || getMediaCategory(media.mimeType),
    uploaderId: media.uploaderId,
    uploaderName: media.uploader?.nickname || media.uploader?.username || "",
    livePhotoVideo: media.livePhotoVideo || null,
    livePhotoImage: media.livePhotoImage || null,
    createdAt: media.createdAt,
  };
}

// GET /api/media — 媒体列表（分页 + 类型筛选）
router.get(
  "/",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
    const offset = (page - 1) * limit;
    const category = req.query.category as string | undefined;
    const kind = req.query.kind as string | undefined;

    const where: any = {};
    if (kind && ["image", "video", "audio", "lyric", "file"].includes(kind)) {
      where.kind = kind;
    }
    // 隐藏实况图的视频组件（已被合并到对应图片条目中）
    if (category && ["image", "video", "audio", "file"].includes(category) && !kind) {
      // 根据类型筛选 MIME 前缀
      const mimeMap: Record<string, string[]> = {
        image: ["image/%"],
        video: ["video/%"],
        audio: ["audio/%"],
        file: [],
      };
      const patterns = mimeMap[category];
      if (patterns.length > 0) {
        where.mimeType = { [Op.or]: patterns.map((p: string) => ({ [Op.like]: p })) };
      } else {
        // file 类型：非 image/video/audio
        where.mimeType = {
          [Op.notLike]: "image/%",
          [Op.and]: [
            { [Op.notLike]: "video/%" },
            { [Op.notLike]: "audio/%" },
          ],
        };
      }
    }
    // 实况图视频组件（livePhotoImage 非空）始终从网格中隐藏——实况图入口已在对应图片条目中
    where.livePhotoImage = { [Op.is]: null };

    const { count, rows: media } = await Media.findAndCountAll({
      where,
      include: [
        { model: User, as: "uploader", attributes: ["id", "username", "nickname"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    res.json({
      data: media.map(formatMedia),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        hasMore: page < Math.ceil(count / limit),
      },
    });
  }
);

// POST /api/media/presign — 创建受控的 R2 暂存上传（仅管理员）
// body: { filename: string, mimeType: string, kind: "image"|"video"|"audio"|"file" }
router.post("/presign", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { filename, mimeType, kind } = req.body || {};
  if (!isR2Ready()) {
    res.status(400).json({ message: "R2 存储未配置" });
    return;
  }

  try {
    const { kind: approvedKind, rule } = getDirectUploadRule(kind, filename, mimeType);
    const intent = await UploadIntent.create({
      uploaderId: req.user!.id,
      kind: approvedKind as MediaKind,
      filename: path.basename(filename),
      mimeType,
      maxSize: rule.maxSize,
      stagingKey: "pending",
      finalKey: "pending",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const stagingKey = buildStagingKey(intent.id, intent.filename);
    const finalKey = buildObjectKey("media", intent.filename);
    await intent.update({ stagingKey, finalKey });
    const { uploadUrl } = await createPresignedUploadForKey(stagingKey, intent.mimeType);
    res.json({ intentId: intent.id, uploadUrl, expiresIn: 600, maxSize: rule.maxSize });
  } catch (err: any) {
    res.status(400).json({ message: err.message || "获取直传地址失败" });
  }
});

// POST /api/media/confirm — 验证暂存对象、提升到公开路径并登记媒体库
// body: { intentId: string }
router.post("/confirm", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { intentId } = req.body || {};
  if (typeof intentId !== "string") {
    res.status(400).json({ message: "缺少 intentId 参数" });
    return;
  }

  let promotedFinalKey = "";
  let stagingKeyToDelete = "";
  let confirmed = false;
  try {
    const full = await sequelize.transaction(async (transaction) => {
      const intent = await UploadIntent.findOne({
        where: { id: intentId, uploaderId: req.user!.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!intent) throw Object.assign(new Error("上传请求不存在"), { status: 404 });
      if (intent.status === "confirmed") {
        if (intent.resultJson) {
          try {
            return JSON.parse(intent.resultJson);
          } catch {
            // fallback to database lookup
          }
        }
        const existing = await Media.findOne({
          where: { url: getR2PublicUrl(intent.finalKey), uploaderId: intent.uploaderId },
          include: [{ model: User, as: "uploader", attributes: ["id", "username", "nickname"] }],
          transaction,
        });
        if (existing) return formatMedia(existing);
        throw Object.assign(new Error("文件已经确认上传"), { status: 409 });
      }
      stagingKeyToDelete = intent.stagingKey;
      if (intent.status !== "pending") throw Object.assign(new Error("上传请求已失效，请重新选择文件"), { status: 410 });
      if (intent.expiresAt.getTime() <= Date.now()) {
        await intent.update({ status: "expired" }, { transaction });
        throw Object.assign(new Error("上传请求已过期，请重新选择文件"), { status: 410 });
      }

      const object = await statR2Object(intent.stagingKey);
      if (!object || object.size <= 0) throw Object.assign(new Error("未找到已上传的文件，请重新上传"), { status: 400 });
      if (object.size > Number(intent.maxSize) || object.contentType !== intent.mimeType) {
        throw Object.assign(new Error("上传文件与已批准的类型或大小不匹配"), { status: 400 });
      }

      promotedFinalKey = intent.finalKey;
      const url = await promoteR2Object(intent.stagingKey, intent.finalKey, intent.mimeType);
      const media = await Media.create({
        filename: intent.filename,
        url,
        storageType: "r2",
        mimeType: intent.mimeType,
        kind: intent.kind,
        size: object.size,
        uploaderId: intent.uploaderId,
      }, { transaction });
      const saved = await Media.findByPk(media.id, {
        include: [{ model: User, as: "uploader", attributes: ["id", "username", "nickname"] }],
        transaction,
      });
      const formatted = formatMedia(saved);
      await intent.update({
        status: "confirmed",
        confirmedAt: new Date(),
        resultJson: JSON.stringify(formatted),
      }, { transaction });
      return formatted;
    });
    confirmed = true;
    res.status(201).json(full);
  } catch (err: any) {
    if (promotedFinalKey) await deleteFromR2(promotedFinalKey);
    res.status(err.status || 500).json({ message: err.message || "登记媒体记录失败" });
  }
  if (confirmed && stagingKeyToDelete) {
    const stagingCleaned = await deleteFromR2(stagingKeyToDelete);
    if (!stagingCleaned) console.warn(`[media] 暂存文件清理失败: ${stagingKeyToDelete}`);
  }
});

// GET /api/media/storage-status — 获取存储就绪状态（仅管理员）
router.get("/storage-status", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const ready = isR2Ready();
  const bucket = process.env.R2_BUCKET || "";
  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  res.json({
    r2Configured: ready,
    bucket: ready ? bucket : "",
    publicUrl: ready ? publicUrl : "",
    storageMode: ready ? "r2" : "external",
  });
});

// GET /api/media/:id/text — 读取本人上传的小型歌词文件，不代理音频。
router.get(
  "/:id/text",
  authenticate,
  requireAdmin,
  [param("id").isUUID()],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const media = await Media.findOne({
      where: { id: String(req.params.id), uploaderId: req.user!.id, storageType: "r2", kind: "lyric" },
    });
    if (!media) {
      res.status(404).json({ message: "歌词文件不存在" });
      return;
    }
    if (Number(media.size) > DIRECT_UPLOAD_RULES.lyric.maxSize) {
      res.status(413).json({ message: "歌词文件过大" });
      return;
    }
    try {
      const key = extractR2Key(media.url);
      if (!key) throw new Error("无法识别 R2 文件地址");
      const buffer = await downloadFromR2(key, DIRECT_UPLOAD_RULES.lyric.maxSize);
      res.json({ id: media.id, filename: media.filename, text: buffer.toString("utf8") });
    } catch (error: any) {
      res.status(502).json({ message: error.message || "读取歌词文件失败" });
    }
  }
);

// POST /api/media/live-photo — 将同一管理员上传的图片和视频登记为实况图配对
// body: { imageMediaId: string, videoMediaId: string }
router.post("/live-photo", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { imageMediaId, videoMediaId } = req.body || {};
  if (typeof imageMediaId !== "string" || typeof videoMediaId !== "string") {
    res.status(400).json({ message: "缺少图片或视频媒体 ID" });
    return;
  }

  try {
    const result = await sequelize.transaction(async (transaction) => {
      if (imageMediaId === videoMediaId) {
        throw Object.assign(new Error("图片和视频不能是同一个媒体"), { status: 400 });
      }

      // Always acquire row locks in the same order for concurrent pairing requests.
      const ids = [imageMediaId, videoMediaId].sort();
      const locked = new Map<string, Media>();
      for (const id of ids) {
        const media = await Media.findOne({
          where: { id, uploaderId: req.user!.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (media) locked.set(id, media);
      }
      const image = locked.get(imageMediaId);
      const video = locked.get(videoMediaId);
      if (!image || !video || !image.mimeType.startsWith("image/") || !video.mimeType.startsWith("video/")) {
        throw Object.assign(new Error("实况图配对必须使用本人上传的图片和视频"), { status: 400 });
      }
      if (image.livePhotoVideo && image.livePhotoVideo !== video.url || video.livePhotoImage && video.livePhotoImage !== image.url) {
        throw Object.assign(new Error("其中一个媒体已与其他文件配对"), { status: 409 });
      }

      await image.update({ livePhotoVideo: video.url }, { transaction });
      await video.update({ livePhotoImage: image.url }, { transaction });
      return { image: image.url, video: video.url, isLivePhoto: true };
    });
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "实况图配对失败" });
  }
});

// DELETE /api/media/:id — 删除媒体文件
router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  [param("id").isUUID()],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const media = await Media.findByPk(req.params.id as string);
    if (!media) {
      res.status(404).json({ message: "媒体文件不存在" });
      return;
    }

    const pair = media.livePhotoVideo || media.livePhotoImage
      ? await Media.findOne({
          where: {
            url: media.livePhotoVideo || media.livePhotoImage || "",
            uploaderId: media.uploaderId,
            kind: media.livePhotoVideo ? "video" : "image",
            id: { [Op.ne]: media.id },
          },
        })
      : null;
    const relatedMedia = [media, ...(pair ? [pair] : [])];
    const relatedIds = relatedMedia.map((item) => item.id);
    const relatedUrls = relatedMedia.map((item) => item.url);

    const playlistReference = await MusicTrack.findOne({
      where: {
        [Op.or]: [
          { audioMediaId: { [Op.in]: relatedIds } },
          { coverMediaId: { [Op.in]: relatedIds } },
          { lyricMediaId: { [Op.in]: relatedIds } },
        ],
      },
      attributes: ["id"],
    });
    if (playlistReference) {
      res.status(409).json({ message: "该媒体正在被网站歌单使用，请先从歌单中移除或替换它" });
      return;
    }
    const postsWithMusic = await Post.findAll({
      where: { music: { [Op.ne]: null } },
      attributes: ["id", "music"],
    });
    if (postsWithMusic.length > 0) {
      const usedByPost = postsWithMusic.some((post) => {
        const music = post.music as any;
        return relatedUrls.includes(music?.url) || relatedUrls.includes(music?.cover);
      });
      if (usedByPost) {
        res.status(409).json({ message: "该媒体正在被动态或文章音乐引用，请先移除对应音乐卡片" });
        return;
      }
    }

    const catalogReference = await CatalogItem.findOne({
      where: { imageMediaId: { [Op.in]: relatedIds } },
      attributes: ["id"],
    });
    if (catalogReference) {
      res.status(409).json({ message: "该媒体正在被装备或 Labs 卡片使用，请先替换或移除对应卡片" });
      return;
    }

    const deletionResults = await Promise.allSettled(
      relatedMedia.map((item) => deleteStoredFile(item.url, item.storageType))
    );
    if (deletionResults.some((result) => result.status === "rejected")) {
      res.status(502).json({ message: "远端文件删除失败，媒体记录已保留，请稍后重试" });
      return;
    }

    try {
      await Media.destroy({ where: { id: { [Op.in]: relatedIds } } });
      res.status(204).send();
    } catch (dbError) {
      console.error("[media delete] 远端文件已删除但数据库记录清理失败:", dbError);
      res.status(500).json({ message: "媒体数据清理失败，请重试以完成同步" });
    }
  }
);

export default router;
