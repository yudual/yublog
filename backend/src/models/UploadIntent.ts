import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type UploadIntentKind = "image" | "video" | "audio" | "lyric" | "file";
export type UploadIntentStatus = "pending" | "confirmed" | "expired";

interface UploadIntentAttributes {
  id: string;
  uploaderId: string;
  kind: UploadIntentKind;
  filename: string;
  mimeType: string;
  maxSize: number;
  stagingKey: string;
  finalKey: string;
  status: UploadIntentStatus;
  /** JSON encoded confirmation response, used to make multi-file confirmation retry-safe. */
  resultJson: string | null;
  expiresAt: Date;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UploadIntentCreationAttributes extends Optional<
  UploadIntentAttributes,
  "id" | "status" | "resultJson" | "confirmedAt" | "createdAt" | "updatedAt"
> {}

class UploadIntent
  extends Model<UploadIntentAttributes, UploadIntentCreationAttributes>
  implements UploadIntentAttributes
{
  declare id: string;
  declare uploaderId: string;
  declare kind: UploadIntentKind;
  declare filename: string;
  declare mimeType: string;
  declare maxSize: number;
  declare stagingKey: string;
  declare finalKey: string;
  declare status: UploadIntentStatus;
  declare resultJson: string | null;
  declare expiresAt: Date;
  declare confirmedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

UploadIntent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    uploaderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    maxSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    stagingKey: {
      type: DataTypes.STRING(600),
      allowNull: false,
    },
    finalKey: {
      type: DataTypes.STRING(600),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending",
    },
    resultJson: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: "result_json",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "upload_intents",
    indexes: [
      { fields: ["uploaderId", "status", "expiresAt"] },
      { fields: ["expiresAt"] },
    ],
  }
);

export default UploadIntent;
