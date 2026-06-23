import mongoose from "mongoose";

const schema = new mongoose.Schema({ safeTxHash: { type: String, unique: true } });
export default mongoose.model("DismissedTx", schema);
