import { z } from "zod";

export function createSessionSetSchema(timedBodyweight = false) {
  const label = timedBodyweight ? "seconds" : "reps";
  const maximum = timedBodyweight ? 10000 : 100;
  return z.object({
    reps: z.coerce.number().int({ message: `Enter whole ${label}` })
      .min(1, { message: `Must be at least 1 ${timedBodyweight ? "second" : "rep"}` })
      .max(maximum, { message: `Maximum ${maximum} ${label}` }),
    weight: z.coerce.number().min(0, { message: "Load cannot be negative" }).max(100000, { message: "Maximum 100000" }),
  });
}
