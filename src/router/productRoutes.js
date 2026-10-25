import express from "express";
import {
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
} from "../controller/productControllers.js";

const router = express.Router();

// app.Method(PAHT, HANDLER );

router.get("/", getProduct);

router.post("/", createProduct);

router.route("/:id").put(updateProduct).delete(deleteProduct);
export const productRoutes = router;
