const jwt = require("jsonwebtoken");
const User = require("../models/User");

function parseHeaderToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return '';
  }

  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  return authHeader.trim();
}

module.exports = async (req, res, next) => {
  try {
    const headerToken = parseHeaderToken(req);
    const cookieToken = req.cookies?.accessToken || '';
    const token = headerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ success: false, message: "No token, authorization denied" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (headerToken && cookieToken && headerToken !== cookieToken) {
        decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
      } else {
        throw err;
      }
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: "Token is not valid" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Token is not valid" });
  }
};