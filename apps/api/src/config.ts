import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const rsUrl = (process.env.DCM4CHEE_RS_URL ?? "").replace(/\/+$/, "");

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
  webOrigin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
  dataDir: path.join(root, "data"),
  imageSource: (process.env.IMAGE_SOURCE ?? "local") as "local" | "dcm4chee",
  dcm4chee: {
    rsUrl,
    wadoUrl: (process.env.DCM4CHEE_WADO_URL || rsUrl.replace(/\/rs$/, "/wado")).replace(/\/+$/, ""),
    token: process.env.DCM4CHEE_TOKEN || "",
    kc: {
      tokenUrl: process.env.DCM4CHEE_KC_TOKEN_URL || "",
      clientId: process.env.DCM4CHEE_KC_CLIENT_ID || "",
      clientSecret: process.env.DCM4CHEE_KC_CLIENT_SECRET || "",
    },
  },
};
