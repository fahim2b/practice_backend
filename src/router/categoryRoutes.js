import express from "express";
import {
  getCategory,
  createCategory,
  deleteCategory,
} from "../controller/categoryControllers.js";

const router = express.Router();

router.get("/", getCategory);
router.post("/", createCategory);
router.route("/:id").delete(deleteCategory);

export const categoryRoutes = router;
