import dotenv from "dotenv";
import sequelize from "../config/database";

dotenv.config();

/** Adds the stored confirmation response needed for idempotent motion-photo retries. */
export async function migrateUploadIntentResult() {
  try {
    await sequelize.query(
      "ALTER TABLE upload_intents ADD COLUMN result_json TEXT NULL DEFAULT NULL"
    );
    console.log("Applied: upload_intents.result_json");
  } catch (error: any) {
    const message = String(error?.message || error);
    if (/duplicate column|already exists/i.test(message)) {
      console.log("Already present: upload_intents.result_json");
    } else {
      throw error;
    }
  }
}

async function main() {
  try {
    await sequelize.authenticate();
    await migrateUploadIntentResult();
  } catch (error) {
    console.error("Upload intent result migration failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
}

if (require.main === module) void main();
