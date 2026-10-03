import { sequelize, User, Post, Comment, Like, SiteSetting, FriendLink } from "../models";

async function migrate() {
  if (process.env.ALLOW_DANGEROUS_ALTER !== "true") {
    console.error("Refusing to execute dangerous sequelize.sync({ alter: true }). Set ALLOW_DANGEROUS_ALTER=true to run.");
    process.exit(1);
  }
  await sequelize.authenticate();
  console.log("Database connected.");
  await sequelize.sync({ alter: true });
  console.log("Tables synchronized (alter mode).");
  await sequelize.close();
  console.log("Done.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
