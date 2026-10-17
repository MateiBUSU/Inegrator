import * as attemptsApi from "./attempts";
import * as authApi from "./auth";
import * as classesApi from "./classes";
import * as documentsApi from "./documents";
import * as materialsApi from "./materials";
import * as meApi from "./me";
import * as practiceApi from "./practice";
import * as topicsApi from "./topics";

export { ApiError, FALLBACK_MESSAGE, messageForCode, userMessage } from "./errors";
export type {
  CreateMaterialInput,
  GenerateMaterialInput,
  MaterialStatus,
  Subject,
  UpdateMaterialInput,
} from "./materials";

export const api = {
  attempts: attemptsApi,
  auth: authApi,
  classes: classesApi,
  documents: documentsApi,
  materials: materialsApi,
  me: meApi,
  practice: practiceApi,
  topics: topicsApi,
};
