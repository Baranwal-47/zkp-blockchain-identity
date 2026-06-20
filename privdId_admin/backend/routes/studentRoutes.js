import express from "express";

import { addStudent, getStudents, getStudentById, getCredentialBlobs, loginStudent, sendStudentEmails, updateStudentById, revokeStudentById, uploadMiddleware, uploadStudents, claimPubkey } from "../controllers/studentController.js";

const router = express.Router();

router.post("/login", loginStudent);
router.get("/", getStudents);
router.post("/", addStudent);
router.post("/upload", uploadMiddleware, uploadStudents);
router.post("/send-email", sendStudentEmails);
// ACCESS-01: must be registered BEFORE the generic getStudentById route below
// — Express matches routes in registration order, so if this were placed
// after that route, the path /credential/<rollNo>/blobs would be swallowed
// by getStudentById with id=credential.
router.get("/credential/:rollNo/blobs", getCredentialBlobs);
router.get("/:id", getStudentById);
router.post("/:id/pubkey", claimPubkey);
router.put("/:id", updateStudentById);
router.delete("/:id", revokeStudentById);

export default router;