/**
 * 上传路由
 * 图片/音频/视频上传统一存储到 Cloudflare R2。
 * 所有上传的文件都会记录到 Media 表（媒体库）。
 *
 * Vercel Serverless 函数请求体上限约 4.5MB（平台硬限制，无法通过配置提高），
 * 因此除了原有的"直接上传到后端"接口（仅适合小文件），本文件还提供了
 * presign / confirm 两个接口，用于大文件（尤其是视频、动态照片）从浏览器
 * 直接 PUT 到 R2，完全绕开后端函数。详见 VERCEL_DEPLOYMENT.md。
 */
import { Router } from "express";
import path from "path";
import multer from "multer";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { sequelize } from "../models";
import {
  deleteStoredFile,
  storeBuffer,
  storeFileAndRecordMedia,
} from "../services/storage-service";
import { extractMotionPhoto } from "../services/motion-photo";
import { Media, UploadIntent, type MediaKind } from "../models";
import { getDirectUploadRule } from "../utils/upload-rules";
import {
  buildObjectKey,
  buildStagingKey,
  createPresignedUploadForKey,
  deleteFromR2,
  downloadFromR2,
  promoteR2Object,
  statR2Object,
  getR2PublicUrl,
} from "../services/r2-service";

const router = Router();

// memoryStorage：传统部署的小文件兼容路径。生产上传应走 R2 直传。
const storage = multer.memoryStorage();

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/jpg"];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const VIDEO_MIMES = ["video/quicktime", "video/mp4", "video/webm", "video/3gpp", "video/3gp", "video/x-m4v"];
const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".3gp", ".m4v"];
const AUDIO_MIMES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "audio/mp4", "audio/flac", "audio/opus"];

const imageUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (IMAGE_MIMES.includes(file.mimetype) && IMAGE_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("仅支持 jpg/png/gif/webp 图片"));
    }
  },
});

const audioUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (AUDIO_MIMES.includes(file.mimetype) && [".mp3", ".wav", ".ogg", ".aac", ".m4a", ".flac", ".opus"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("仅支持 mp3/wav/ogg/aac 音频"));
    }
  },
});

const videoUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (VIDEO_MIMES.includes(file.mimetype) && VIDEO_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("仅支持 mov/mp4/webm 视频"));
    }
  },
});

// 动态照片（Motion Photo）：单个 JPEG 内嵌 MP4，文件可能较大
const motionPhotoUpload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isImage = IMAGE_MIMES.includes(file.mimetype) && IMAGE_EXTS.includes(ext);
    if (isImage) {
      cb(null, true);
    } else {
      cb(new Error("动态照片需为 JPEG 格式"));
    }
  },
});

// POST /api/upload - upload an image (admin only)
router.post("/", authenticate, requireAdmin, imageUpload.single("image"), async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ message: "没有上传文件" });
    return;
  }
  try {
    const { url } = await storeFileAndRecordMedia(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      req.user!.id
    );
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "上传失败" });
  }
});

// POST /api/upload/audio - upload an audio file (admin only)
router.post("/audio", authenticate, requireAdmin, audioUpload.single("audio"), async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ message: "没有上传文件" });
    return;
  }
  try {
    const { url } = await storeFileAndRecordMedia(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      req.user!.id
    );
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "上传失败" });
  }
});

// POST /api/upload/video - upload a video file (admin only)
// 注意：Vercel Serverless 函数请求体上限约 4.5MB，超过该大小的视频
// 在部署到 Vercel 后会在到达这里之前就被平台拒绝（413）。
// 大文件请改用 POST /api/upload/presign + PUT 到 R2 + POST /api/upload/confirm。
router.post("/video", authenticate, requireAdmin, videoUpload.single("video"), async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ message: "没有上传文件" });
    return;
  }
  try {
    const { url } = await storeFileAndRecordMedia(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      req.user!.id
    );
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "上传失败" });
  }
});

// POST /api/upload/motion-photo - upload a motion photo (single JPEG with embedded MP4)
// 自动拆分为图片+视频，返回配对 URL。如果文件不含嵌入视频则降级为普通图片。
router.post(
  "/motion-photo",
  authenticate,
  requireAdmin,
  motionPhotoUpload.single("file"),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      res.status(400).json({ message: "没有上传文件" });
      return;
    }
    try {
      const extracted = extractMotionPhoto(req.file.buffer);

      if (extracted) {
        const imageName = `${path.basename(req.file.originalname, path.extname(req.file.originalname))}.jpg`;
        const videoName = `${path.basename(req.file.originalname, path.extname(req.file.originalname))}.mp4`;

        const [imageResult, videoResult] = await Promise.all([
          storeFileAndRecordMedia(extracted.image, imageName, extracted.imageMime, req.user!.id),
          storeFileAndRecordMedia(extracted.video, videoName, extracted.videoMime, req.user!.id),
        ]);

        res.json({ image: imageResult.url, video: videoResult.url, isLivePhoto: true });
      } else {
        const { url } = await storeFileAndRecordMedia(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          req.user!.id
        );
        res.json({ image: url, video: null, isLivePhoto: false });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "动态照片处理失败" });
    }
  }
);

// 兼容旧客户端的直传接口：上传必须先创建属于当前管理员的 UploadIntent，
// confirm 阶段只接受该意图对应的 staging key，并以 R2 HEAD 的结果为准。
router.post("/presign", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { filename, mimeType, kind } = req.body || {};
  if (typeof filename !== "string" || !filename.trim()) {
    res.status(400).json({ message: "缺少 filename 参数" });
    return;
  }
  const normalizedMime = typeof mimeType === "string" && mimeType ? mimeType : "application/octet-stream";
  const requestedKind = kind === "motion-photo" ? "image" : kind;
  const inferredKind = requestedKind || (
    normalizedMime.startsWith("image/") ? "image" :
      normalizedMime.startsWith("video/") ? "video" :
        normalizedMime.startsWith("audio/") ? "audio" : "file"
  );
  if (!["image", "video", "audio", "file"].includes(inferredKind)) {
    res.status(400).json({ message: "不支持的上传类型" });
    return;
  }
  try {
    const { rule } = getDirectUploadRule(inferredKind, filename, normalizedMime);
    const maxSize = kind === "motion-photo" ? 60 * 1024 * 1024 : rule.maxSize;
    const intent = await UploadIntent.create({
      uploaderId: req.user!.id,
      kind: inferredKind as MediaKind,
      filename: path.basename(filename).slice(0, 255),
      mimeType: normalizedMime,
      maxSize,
      stagingKey: "pending",
      finalKey: "pending",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const stagingKey = buildStagingKey(intent.id, intent.filename);
    const finalKey = buildObjectKey("media", intent.filename);
    await intent.update({ stagingKey, finalKey });
    const { uploadUrl, publicUrl } = await createPresignedUploadForKey(stagingKey, normalizedMime);
    res.json({ uploadUrl, publicUrl, key: stagingKey, intentId: intent.id, expiresIn: 600, maxSize });
  } catch (err: any) {
    res.status(400).json({ message: err.message || "获取直传地址失败" });
  }
});

router.post("/confirm", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { key } = req.body || {};
  if (typeof key !== "string" || !key) {
    res.status(400).json({ message: "缺少 key 参数" });
    return;
  }
  let promotedFinalKey = "";
  let stagingKeyToDelete = "";
  let confirmed = false;
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const intent = await UploadIntent.findOne({
        where: { stagingKey: key, uploaderId: req.user!.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!intent) throw Object.assign(new Error("上传请求不存在或不属于当前用户"), { status: 404 });
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
          transaction,
        });
        if (existing) return { url: existing.url, mediaId: existing.id };
        throw Object.assign(new Error("文件已经确认上传"), { status: 409 });
      }
      stagingKeyToDelete = intent.stagingKey;
      if (intent.status !== "pending") throw Object.assign(new Error("上传请求已失效，请重新选择文件"), { status: 410 });
      if (intent.expiresAt.getTime() <= Date.now()) {
        await intent.update({ status: "expired" }, { transaction });
        throw Object.assign(new Error("上传请求已过期，请重新选择文件"), { status: 410 });
      }
      const object = await statR2Object(intent.stagingKey);
      if (!object || object.size <= 0 || object.size > Number(intent.maxSize) || object.contentType !== intent.mimeType) {
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
      const confirmationPayload = { url, mediaId: media.id };
      await intent.update({
        status: "confirmed",
        confirmedAt: new Date(),
        resultJson: JSON.stringify(confirmationPayload),
      }, { transaction });
      return confirmationPayload;
    });
    confirmed = true;
    res.status(201).json(result);
  } catch (err: any) {
    if (promotedFinalKey) await deleteFromR2(promotedFinalKey);
    res.status(err.status || 500).json({ message: err.message || "登记媒体记录失败" });
  }
});

// 动态照片兼容确认：仍然只允许读取当前管理员自己的暂存对象。
router.post("/motion-photo/confirm", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { key, filename } = req.body || {};
  if (typeof key !== "string" || !key) {
    res.status(400).json({ message: "缺少 key 参数" });
    return;
  }
  let uploadedUrls: string[] = [];
  let stagingKeyToDelete = "";
  let confirmed = false;
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const intent = await UploadIntent.findOne({
        where: { stagingKey: key, uploaderId: req.user!.id, kind: "image" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!intent) throw Object.assign(new Error("上传请求不存在或不属于当前用户"), { status: 404 });
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
          transaction,
        });
        if (existing) {
          return { image: existing.url, video: null, isLivePhoto: false, mediaId: existing.id };
        }
        throw Object.assign(new Error("文件已经确认上传"), { status: 409 });
      }
      stagingKeyToDelete = intent.stagingKey;
      if (intent.status !== "pending") throw Object.assign(new Error("上传请求已失效，请重新选择文件"), { status: 410 });
      if (intent.expiresAt.getTime() <= Date.now()) {
        await intent.update({ status: "expired" }, { transaction });
        throw Object.assign(new Error("上传请求已过期，请重新选择文件"), { status: 410 });
      }
      const object = await statR2Object(intent.stagingKey);
      if (!object || object.size <= 0 || object.size > 60 * 1024 * 1024 || object.contentType !== intent.mimeType) {
        throw Object.assign(new Error("动态照片对象无效或超过大小限制"), { status: 400 });
      }
      const buffer = await downloadFromR2(intent.stagingKey, 60 * 1024 * 1024);
      const extracted = extractMotionPhoto(buffer);
      const baseName = path.basename(filename || intent.filename, path.extname(filename || intent.filename));
      if (extracted) {
        const image = await storeBuffer(extracted.image, `${baseName}.jpg`, extracted.imageMime);
        uploadedUrls.push(image.url);
        const video = await storeBuffer(extracted.video, `${baseName}.mp4`, extracted.videoMime);
        uploadedUrls.push(video.url);
        const [imageMedia, videoMedia] = await Promise.all([
          Media.create({ filename: `${baseName}.jpg`, url: image.url, storageType: "r2", mimeType: extracted.imageMime, kind: "image", size: extracted.image.length, uploaderId: req.user!.id }, { transaction }),
          Media.create({ filename: `${baseName}.mp4`, url: video.url, storageType: "r2", mimeType: extracted.videoMime, kind: "video", size: extracted.video.length, uploaderId: req.user!.id }, { transaction }),
        ]);
        const confirmationPayload = { image: imageMedia.url, video: videoMedia.url, isLivePhoto: true };
        await intent.update({
          status: "confirmed",
          confirmedAt: new Date(),
          resultJson: JSON.stringify(confirmationPayload),
        }, { transaction });
        return confirmationPayload;
      }

      const url = await promoteR2Object(intent.stagingKey, intent.finalKey, intent.mimeType);
      uploadedUrls.push(url);
      const media = await Media.create({ filename: filename || intent.filename, url, storageType: "r2", mimeType: intent.mimeType, kind: "image", size: object.size, uploaderId: req.user!.id }, { transaction });
      const confirmationPayload = { image: url, video: null, isLivePhoto: false, mediaId: media.id };
      await intent.update({
        status: "confirmed",
        confirmedAt: new Date(),
        resultJson: JSON.stringify(confirmationPayload),
      }, { transaction });
      return confirmationPayload;
    });
    confirmed = true;
    res.json(result);
  } catch (err: any) {
    await Promise.allSettled(uploadedUrls.map((url) => deleteStoredFile(url, "r2")));
    res.status(err.status || 500).json({ message: err.message || "动态照片处理失败" });
  }
  if (confirmed && stagingKeyToDelete) {
    const stagingCleaned = await deleteFromR2(stagingKeyToDelete);
    if (!stagingCleaned) console.warn(`[upload] 动态照片暂存文件清理失败: ${stagingKeyToDelete}`);
  }
});

export default router;
