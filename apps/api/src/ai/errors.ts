import { HttpError } from "../middleware/error-handler";

/** The AI could not produce valid content (provider error, timeout or invalid output after one retry). */
export class AiUnavailableError extends HttpError {
  constructor() {
    super(
      503,
      "AI_UNAVAILABLE",
      "Generarea cu AI nu este disponibilă momentan. Conținutul existent rămâne accesibil; încearcă din nou mai târziu.",
    );
  }
}
