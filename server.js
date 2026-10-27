import { connectDB } from "./src/config/db.js";
import express from "express";
import dotenv from "dotenv";
import { productRoutes } from "./src/router/productRoutes.js";
import { categoryRoutes } from "./src/router/categoryRoutes.js";

dotenv.config();

const port = process.env.PORT;
const app = express();

//middleware
app.use(express.json());

await connectDB();

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "server is healthy",
  });
});

//Router
app.use("/api/v1/product", productRoutes);
app.use("/api/v1/category", categoryRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API not found",
  });
});

app.listen(port, () => {
  console.log(`Example app is listening on port ${port}`);
});
