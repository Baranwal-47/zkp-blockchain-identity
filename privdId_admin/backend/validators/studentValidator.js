import Joi from "joi";

export const studentSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().email().max(62).required(), // max(62) enforces the 2-chunk (maxChunks=2) contract; IDENTITY_SPEC §2
  rollNo: Joi.string().trim().min(1).max(50).required(),
  programme: Joi.string().trim().min(2).max(120).optional(), // no longer committed; retained for display
  programmeLevel: Joi.string().valid("B.Tech", "B.Des", "Dual", "M.Tech", "M.Des", "PhD").required(),
  discipline: Joi.string().valid("CSE", "ECE", "ME", "SmartMfg", "Design", "NatSci").required(),
  batch: Joi.number().integer().min(1990).max(2100).required(),
  contactNo: Joi.string().trim().min(5).max(20).optional(), // operational; not committed
  dob: Joi.string().trim().allow("").optional(),
});

export function validateStudentPayload(payload) {
  return studentSchema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
}