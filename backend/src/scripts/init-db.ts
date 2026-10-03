import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { ContentPage, MusicPlaylist, sequelize, SiteSetting, siteSettingTextDefaults, User } from "../models";
import { migrateContentPages } from "./migrate-content-pages";
import { migrateFontFamily } from "./migrate-font-family";
import { migrateDoubanCache } from "./migrate-douban-cache";
import { migrateFooterHtml } from "./migrate-footer-html";
import { migrateDecorationImage } from "./migrate-decoration-image";
import { migrateCatalogItemFields } from "./migrate-catalog-item-fields";
import { migrateR2MusicFields } from "./migrate-r2-music-fields";
import { migrateRemoveAds } from "./migrate-remove-ads";
import { migrateArticleCollections } from "./migrate-article-collections";
import { migrateIndexes } from "./migrate-indexes";
import { migrateUploadIntentResult } from "./migrate-upload-intent-result";

const DEFAULT_PLAYLIST_SLUG = "site-default";

function adminConfig() {
  return {
    email: process.env.ADMIN_EMAIL || "admin@yugold.top",
    password: process.env.ADMIN_PASSWORD || "123456",
    username: process.env.ADMIN_USERNAME || "admin",
  };
}

async function ensureSiteSettings() {
  const [settings, created] = await SiteSetting.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, ...siteSettingTextDefaults },
  });
  console.log(created ? "Site settings created." : "Site settings already exist.");
  return settings;
}

async function ensureDefaultPlaylist() {
  const [playlist, created] = await MusicPlaylist.findOrCreate({
    where: { slug: DEFAULT_PLAYLIST_SLUG },
    defaults: { slug: DEFAULT_PLAYLIST_SLUG, name: "网站歌单" },
  });
  console.log(created ? "Default music playlist created." : "Default music playlist already exists.");
  return playlist;
}

async function ensureAdmin() {
  const existingAdmin = await User.findOne({ where: { role: "admin" }, order: [["createdAt", "ASC"]] });
  const { email, password, username } = adminConfig();

  if (existingAdmin) {
    if (!existingAdmin.username) {
      const usernameOwner = await User.findOne({ where: { username } });
      if (!usernameOwner || usernameOwner.id === existingAdmin.id) {
        await existingAdmin.update({ username });
        console.log(`Existing admin username set to "${username}". Password was not changed.`);
      } else {
        console.warn(`Existing admin has no username, but "${username}" is already in use. No users were changed.`);
      }
    } else {
      console.log(`Admin already exists (${existingAdmin.email}). Password was not changed.`);
    }
    return existingAdmin;
  }

  const emailOwner = await User.findOne({ where: { email } });
  if (emailOwner) {
    throw new Error(`Cannot create admin: ADMIN_EMAIL ${email} already belongs to a non-admin user. Choose another ADMIN_EMAIL or update that user manually.`);
  }

  const usernameOwner = await User.findOne({ where: { username } });
  if (usernameOwner) {
    throw new Error(`Cannot create admin: ADMIN_USERNAME "${username}" is already in use. Choose another ADMIN_USERNAME.`);
  }

  const admin = await User.create({
    email,
    username,
    password: await bcrypt.hash(password, 10),
    nickname: "Dual",
    avatar: "",
    cover: "https://picsum.photos/seed/momentscover/1200/600",
    bio: "Dual 的个人博客 · YuBlog",
    role: "admin",
  });
  console.log(`Admin created (${admin.email}).`);
  return admin;
}

async function ensureAboutPage(adminId: string) {
  const [, created] = await ContentPage.findOrCreate({
    where: { slug: "about" },
    defaults: { slug: "about", authorId: adminId, content: "" },
  });
  console.log(created ? "About page created." : "About page already exists.");
}

/**
 * Initializes an existing database without altering or deleting existing data.
 * This is the only supported first-deployment database setup flow.
 */
export async function initializeDatabase() {
  await sequelize.authenticate();
  console.log("Database connected.");

  // Deliberately omit alter/force: this only creates missing model tables.
  await sequelize.sync();
  console.log("Database tables verified.");

  // Safe, additive compatibility steps for databases created by older releases.
  await migrateContentPages();
  await migrateDoubanCache();
  await migrateFontFamily();
  await migrateFooterHtml();
  await migrateDecorationImage();
  await migrateCatalogItemFields();
  await migrateR2MusicFields();
  await migrateRemoveAds();
  await migrateArticleCollections();
  await migrateUploadIntentResult();
  await migrateIndexes();

  await ensureSiteSettings();
  await ensureDefaultPlaylist();
  const admin = await ensureAdmin();
  await ensureAboutPage(admin.id);

  console.log("Database initialization completed successfully.");
}

async function main() {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
}

if (require.main === module) {
  void main();
}
