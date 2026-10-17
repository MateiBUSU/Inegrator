import * as authApi from "./auth";
import * as classesApi from "./classes";
import * as documentsApi from "./documents";
import * as materialsApi from "./materials";

export { ApiError, FALLBACK_MESSAGE, messageForCode, userMessage } from "./errors";
export type {
  CreateMaterialInput,
  GenerateMaterialInput,
  MaterialStatus,
  Subject,
  UpdateMaterialInput,
} from "./materials";

export const api = {
  auth: authApi,
  classes: classesApi,
  documents: documentsApi,
  materials: materialsApi,
};
