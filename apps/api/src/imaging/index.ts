import path from "node:path";
import { config } from "../config.js";
import { Dcm4cheeSource } from "./dcm4cheeSource.js";
import { LocalSource } from "./localSource.js";
import type { ImageSource } from "./types.js";

export function createImageSource(): ImageSource {
  if (config.imageSource === "dcm4chee") {
    if (!config.dcm4chee.rsUrl) throw new Error("ต้องกำหนด DCM4CHEE_RS_URL เมื่อใช้ IMAGE_SOURCE=dcm4chee");
    return new Dcm4cheeSource();
  }
  return new LocalSource(path.join(config.dataDir, "dicom"));
}

export type { ImageSource, InstanceMeta } from "./types.js";
