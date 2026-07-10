class ApiResponse {
  static success(res, data, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      ...data
    });
  }

  static error(res, message, statusCode = 500, errors = null) {
    const response = {
      success: false,
      message,
      code: `ERR_${statusCode}`
    };
    if (errors) response.errors = errors;
    return res.status(statusCode).json(response);
  }

  static paginated(res, data, total, page, limit) {
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  }
}

module.exports = ApiResponse;
