import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getCollection = () => getDB().collection("category");

export const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (typeof name !== "string" || !name.trim()) {
    throw new ApiError(400, "Category name is required");
  }

  const normalizedName = name.trim().toLowerCase();

  const existingCategory = await getCollection().findOne({
    name: normalizedName,
  });

  if (existingCategory) {
    throw new ApiError(409, "Category already exists");
  }

  const result = await getCollection().insertOne({
    name: normalizedName,
  });

  res.status(201).json({
    success: true,
    data: {
      _id: result.insertedId,
      name: normalizedName,
    },
  });
});

export const getCategory = async (req, res) => {
  const data = await getCollection().find().toArray();

  if (data.length > 0) {
    res.status(200).json({
      success: true,
      data: data,
    });
  } else {
    res.status(200).json({
      success: true,
      message: "No Data Found",
    });
  }
};

export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid MongoDB ObjectId format");
  }

  const categoryId = new ObjectId(id);

  const existingProduct = await getDB()
    .collection("product")
    .findOne({ category: categoryId });

  if (existingProduct) {
    throw new ApiError(
      409,
      "Cannot delete cateogory becuase product are using it",
    );
  }
  const result = await getCollection().deleteOne({ _id: categoryId });

  if (result.deletedCount === 0) {
    throw new ApiError(404, "Category not found");
  }

  res.status(200).json({
    success: true,
    message: "Category deleted successfully",
  });
});
