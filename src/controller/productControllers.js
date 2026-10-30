import { getDB } from "../config/db.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ObjectId } from "mongodb";

const getCollection = () => getDB().collection("product");
const getCategoryCollection = () => getDB().collection("category");

const getProductsWithCategory = () => [
  {
    $lookup: {
      from: "category",
      localField: "category",
      foreignField: "_id",
      as: "categoryDetails",
    },
  },

  {
    $unwind: {
      path: "$categoryDetails",
      preserveNullAndEmptyArrays: true,
    },
  },

  {
    $project: {
      name: 1,
      price: 1,
      inStock: 1,
      createdAt: 1,
      updatedAt: 1,
      category: {
        $ifNull: ["$categoryDetails.name", null],
      },
    },
  },
];

export const createProduct = asyncHandler(async (req, res) => {
  const { name, price, category, inStock } = req.body;
  if (
    !name ||
    typeof name !== "string" ||
    !name.trim() ||
    price === undefined ||
    !Number.isFinite(Number(price)) ||
    !category
  ) {
    throw new ApiError(400, "Please provide a valid name, price, and category");
  }

  if (typeof category !== "string") {
    throw new ApiError(400, "Category must be a String");
  }

  const normalizedCategory = category.trim().toLowerCase();

  const existingCateogry = await getCategoryCollection().findOne({
    name: normalizedCategory,
  });

  if (!existingCateogry) {
    throw new ApiError(400, "Invalid category");
  }

  const newProduct = {
    name: String(name).trim(),
    price: Number(price),
    category: existingCateogry._id,
    inStock: inStock !== undefined ? Boolean(inStock) : true,
    createdAt: new Date(),
  };

  const result = await getCollection().insertOne(newProduct);

  res.status(201).json({
    success: true,
    data: {
      _id: result.insertedId,
      ...newProduct,
      category: existingCateogry.name,
    },
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const { name, category, price, minPrice, maxPrice, inStock } = req.query;

  // Step 1: Build a MongoDB filter.
  const filter = {};

  // Search by product name (case-insensitive partial match).
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      throw new ApiError(400, "Name must be a non-empty string");
    }

    // Escape regex special characters so the input is treated as text.
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.name = {
      $regex: escapedName,
      $options: "i",
    };
  }

  // Search by category name.
  if (category !== undefined) {
    if (typeof category !== "string" || !category.trim()) {
      throw new ApiError(400, "Category must be a non-empty string");
    }

    const existingCategory = await getCategoryCollection().findOne({
      name: category.trim().toLowerCase(),
    });

    // A category that doesn't exist cannot match any products.
    if (!existingCategory) {
      return res.status(200).json({
        success: true,
        message: "No Data Found",
        data: [],
      });
    }

    // Products store the category ObjectId, not its name.
    filter.category = existingCategory._id;
  }

  // Search by exact price.
  if (price !== undefined) {
    if (
      price === "" ||
      !Number.isFinite(Number(price)) ||
      minPrice !== undefined ||
      maxPrice !== undefined
    ) {
      throw new ApiError(
        400,
        "Price must be a valid number and cannot be combined with minPrice or maxPrice",
      );
    }

    filter.price = Number(price);
  }

  // Search by minimum price.
  if (minPrice !== undefined) {
    if (minPrice === "" || !Number.isFinite(Number(minPrice))) {
      throw new ApiError(400, "minPrice must be a valid number");
    }

    filter.price = {
      ...filter.price,
      $gte: Number(minPrice),
    };
  }

  // Search by maximum price.
  if (maxPrice !== undefined) {
    if (maxPrice === "" || !Number.isFinite(Number(maxPrice))) {
      throw new ApiError(400, "maxPrice must be a valid number");
    }

    filter.price = {
      ...filter.price,
      $lte: Number(maxPrice),
    };
  }

  // Reject a minimum price greater than the maximum price.
  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    Number(minPrice) > Number(maxPrice)
  ) {
    throw new ApiError(400, "minPrice cannot be greater than maxPrice");
  }

  // Search by stock availability.
  if (inStock !== undefined) {
    if (inStock !== "true" && inStock !== "false") {
      throw new ApiError(400, 'inStock must be either "true" or "false"');
    }

    filter.inStock = inStock === "true";
  }

  // Step 2: Filter products, then reuse the category lookup pipeline.
  const data = await getCollection()
    .aggregate([{ $match: filter }, ...getProductsWithCategory()])
    .toArray();

  // Step 3: Return the matching products.
  res.status(200).json({
    success: true,
    count: data.length,
    data,
    ...(data.length === 0 ? { message: "No Data Found" } : {}),
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid MongoDB ObjectId format");
  }

  const updateFields = {
    ...req.body,
    updatedAt: new Date(),
  };

  if (updateFields.category !== undefined) {
    if (typeof updateFields.category !== "string") {
      throw new ApiError(400, "Category must be a string");
    }

    const normalizedCategory = updateFields.category.trim().toLowerCase();

    const existingCategory = await getCategoryCollection().findOne({
      name: normalizedCategory,
    });

    if (!existingCategory) {
      throw new ApiError(400, "Invalid category");
    }

    updateFields.category = existingCategory._id;
  }

  if (updateFields.price !== undefined) {
    if (
      updateFields.price === "" ||
      !Number.isFinite(Number(updateFields.price))
    ) {
      throw new ApiError(400, "Price must be a valid number");
    }

    updateFields.price = Number(updateFields.price);
  }

  const result = await getCollection().updateOne(
    { _id: new ObjectId(id) },
    { $set: updateFields },
  );

  if (result.matchedCount === 0) {
    throw new ApiError(404, "Product not found");
  }

  const updatedProduct = await getCollection()
    .aggregate([
      { $match: { _id: new ObjectId(id) } },
      ...getProductsWithCategory(),
    ])
    .next();

  res.status(200).json({
    success: true,
    message: "Product updated successfully",
    data: updatedProduct,
  });
});

export const deleteProduct = async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid MongoDB ObjectId format");
  }

  const result = await getCollection().deleteOne({
    _id: new ObjectId(id),
  });

  if (result.deletedCount === 0) {
    throw new ApiError(404, "Product not found");
  }

  res.status(200).json({
    success: true,
    message: "Product deleted successfully",
  });
};
