const mongoose = require('mongoose');

const mockModel = (name, methods = {}) => {
  const Model = function (data) {
    Object.assign(this, data);
  };

  Model.save = jest.fn().mockResolvedValue();
  Model.findOne = jest.fn();
  Model.findById = jest.fn();
  Model.find = jest.fn();
  Model.findByIdAndUpdate = jest.fn();
  Model.findByIdAndDelete = jest.fn();
  Model.create = jest.fn();
  Model.deleteOne = jest.fn();
  Model.deleteMany = jest.fn();
  Model.updateOne = jest.fn();
  Model.countDocuments = jest.fn();

  Object.entries(methods).forEach(([key, fn]) => {
    Model[key] = fn;
  });

  return Model;
};

const mockObjectId = () => new mongoose.Types.ObjectId().toString();

module.exports = { mockModel, mockObjectId };
