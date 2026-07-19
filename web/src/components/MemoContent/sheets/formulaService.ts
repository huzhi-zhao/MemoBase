import { create } from "@bufbuild/protobuf";
import { aiServiceClient } from "@/connect";
import { GenerateFormulaRequestSchema } from "@/types/proto/api/v1/ai_service_pb";

export const formulaService = {
  /**
   * Generate a spreadsheet formula from a natural-language `prompt` via the
   * instance AI provider. `context` optionally grounds the model with the
   * active cell reference and the sheet's header/sample rows. Returns the
   * formula string (beginning with "=").
   */
  async generate(prompt: string, context?: string): Promise<string> {
    const response = await aiServiceClient.generateFormula(
      create(GenerateFormulaRequestSchema, {
        prompt,
        context: context ?? "",
      }),
    );
    return response.formula;
  },
};
