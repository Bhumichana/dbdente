"use client";

import * as core from "@cornerstonejs/core";
import { init as initLoader } from "@cornerstonejs/dicom-image-loader";
import * as tools from "@cornerstonejs/tools";
import { useSession } from "@/lib/session";

let ready: Promise<void> | null = null;

/** เริ่ม Cornerstone3D ครั้งเดียวต่อหน้า */
export function initCornerstone() {
  ready ??= (async () => {
    core.init();
    initLoader({
      maxWebWorkers: Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2))),
      // แนบ JWT ทุกครั้งที่ loader ดึงไฟล์ DICOM จาก API (ห้ามเข้าถึง PACS ตรง)
      beforeSend: () => {
        const token = useSession.getState().token;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
      },
    });
    tools.init();
    for (const T of [
      tools.WindowLevelTool,
      tools.PanTool,
      tools.ZoomTool,
      tools.LengthTool,
      tools.AngleTool,
      tools.ArrowAnnotateTool,
    ]) {
      tools.addTool(T);
    }
  })();
  return ready;
}

export { core, tools };
