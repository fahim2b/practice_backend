import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.send("I am from category routes");
});

export const categoryRoutes = router;
