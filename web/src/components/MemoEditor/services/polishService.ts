import { create } from "@bufbuild/protobuf";
import { aiServiceClient } from "@/connect";
import { PolishTextRequestSchema } from "@/types/proto/api/v1/ai_service_pb";

/** Named preset actions. Keep in sync with the backend's polishPresetInstructions. */
export type PolishPreset = "polish" | "concise" | "expand" | "grammar" | "tone";

export const polishService = {
  /**
   * Rewrite `text` via the instance AI provider. Pass a custom `instruction`,
   * or a named `preset` (the instruction wins when both are set). Returns the
   * rewritten text; the model replies in the selection's own language.
   */
  async polish(text: string, opts: { instruction?: string; preset?: PolishPreset }): Promise<string> {
    const response = await aiServiceClient.polishText(
      create(PolishTextRequestSchema, {
        text,
        instruction: opts.instruction ?? "",
        preset: opts.preset ?? "",
      }),
    );
    return response.text;
  },
};
