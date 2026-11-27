export interface InstanceMeta {
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopInstanceUid: string;
  patientId: string; // DICOM PatientID เช่น DEMO01-HN000123
  modality: string;
  studyDate: string; // YYYYMMDD
  seriesDescription: string;
  rows: number;
  columns: number;
}

export class ReadOnlyError extends Error {
  constructor() {
    super("PACS ตั้งเป็นโหมดอ่านอย่างเดียว (DCM4CHEE_READ_ONLY) — ไม่อนุญาตให้อัปโหลด");
  }
}

export interface ImageSource {
  readonly name: string;
  readonly readOnly: boolean;
  listByPatient(dicomPatientId: string): Promise<InstanceMeta[]>;
  find(sopInstanceUid: string): Promise<InstanceMeta | null>;
  retrieve(meta: InstanceMeta): Promise<Buffer>;
  thumbnail(meta: InstanceMeta): Promise<{ contentType: string; body: Buffer } | null>;
  store(part10: Buffer): Promise<InstanceMeta>;
}
