import { getDB } from "../config/db.js";
import { ApiError } from "../utils/apiError.js";
import { ObjectId } from "mongodb";

const getCollection = () => getDB().collection("product");

export const createProduct = async (req, res) => {
  const { name, price, category, inStock } = req.body;

  if (!name || price === undefined || !category) {
    throw new ApiError(
      400,
      "Please provide all required fields: name, price, category",
    );
  }

  const newProduct = {
    name: String(name).trim(),
    price: Number(price),
    category: String(category).trim(),
    inStock: inStock !== undefined ? Boolean(inStock) : true,
    createdAt: new Date(),
  };

  const result = await getCollection().insertOne(newProduct);

  res.status(201).json({
    success: true,
    data: {
      _id: result.insertedId,
      ...newProduct,
    },
  });
};

export const getProduct = async (req, res) => {
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

export const updateProduct = async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid MongoDB ObjectId format");
  }

  const updateFields = {
    ...req.body,
    updatedAt: new Date(),
  };

  if (updateFields.price !== undefined) {
    updateFields.price = Number(updateFields.price);
  }

  const result = await getCollection().updateOne(
    { _id: new ObjectId(id) },
    { $set: updateFields },
  );

  if (result.matchedCount === 0) {
    throw new ApiError(404, "Product not found");
  }

  const updatedProduct = await getCollection().findOne({
    _id: new ObjectId(id),
  });

  res.status(200).json({
    success: true,
    message: "Product updated successfully",
    data: updatedProduct,
  });
};

export const deleteProduct = async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid MongoDB ObjectId format");
  }

  const result = await getCollection().deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    throw new ApiError(404, "Product not found");
  }

  res.status(200).json({
    success: true,
    message: "Product deleted successfully",
  });
};
