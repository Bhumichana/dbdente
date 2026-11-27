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

export interface ImageSource {
  readonly name: string;
  listByPatient(dicomPatientId: string): Promise<InstanceMeta[]>;
  find(sopInstanceUid: string): Promise<InstanceMeta | null>;
  retrieve(meta: InstanceMeta): Promise<Buffer>;
  thumbnail(meta: InstanceMeta): Promise<{ contentType: string; body: Buffer } | null>;
  store(part10: Buffer): Promise<InstanceMeta>;
}
