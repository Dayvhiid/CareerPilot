const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const tokenStore = require('./tokenStore');

const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY_SECONDS = tokenStore.DEFAULT_TTL_SECONDS;
const ISSUER = process.env.JWT_ISSUER || 'careerpilot';
const AUDIENCE = process.env.JWT_AUDIENCE || 'careerpilot-app';

function generateAccessToken(userId) {
  return jwt.sign(
    {
      id: String(userId),
      type: 'access',
      iss: ISSUER,
      aud: AUDIENCE,
      jti: crypto.randomBytes(16).toString('hex'),
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

async function issueRefreshToken(userId) {
  const tokenId = crypto.randomBytes(32).toString('hex');
  const token = jwt.sign(
    {
      id: String(userId),
      type: 'refresh',
      tokenId,
      iss: ISSUER,
      aud: AUDIENCE,
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  await tokenStore.storeRefreshToken(tokenId, userId);
  return { token, tokenId };
}

/**
 * Verify a refresh token's signature and presence in the token store.
 * Returns the decoded payload, or null when the token is invalid/revoked.
 */
async function verifyRefreshToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    return null;
  }

  if (!decoded || decoded.type !== 'refresh' || !decoded.tokenId) {
    return null;
  }

  const stored = await tokenStore.getRefreshToken(decoded.tokenId);
  if (!stored || stored.userId !== String(decoded.id)) {
    return null;
  }

  return decoded;
}

/**
 * Revoke a refresh token (and any tokens for the user when reuse is detected).
 */
async function revokeRefreshToken(token, { revokeAllOnReuse = true } = {}) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    if (!decoded?.tokenId) return null;
    const stored = await tokenStore.getRefreshToken(decoded.tokenId);
    if (!stored && revokeAllOnReuse && decoded.id) {
      await tokenStore.revokeAllUserTokens(decoded.id);
      return null;
    }
    await tokenStore.deleteRefreshToken(decoded.tokenId);
    return decoded;
  } catch (err) {
    try {
      const decoded = jwt.decode(token);
      if (decoded?.tokenId) {
        await tokenStore.deleteRefreshToken(decoded.tokenId);
      }
    } catch (decodeErr) {
      // ignore
    }
    return null;
  }
}

function parseDuration(value) {
  if (typeof value === 'number') return value;
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(String(value).trim());
  if (!match) return 15 * 60 * 1000;
  const [, num, unit] = match;
  const multipliers = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return parseInt(num, 10) * multipliers[unit];
}

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
};

function setAccessTokenCookie(res, token) {
  res.cookie('accessToken', token, {
    ...baseCookieOptions,
    maxAge: parseDuration(ACCESS_EXPIRY),
  });
}

function setRefreshTokenCookie(res, token) {
  res.cookie('refreshToken', token, {
    ...baseCookieOptions,
    maxAge: REFRESH_EXPIRY_SECONDS * 1000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
}

module.exports = {
  generateAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens: tokenStore.revokeAllUserTokens,
  deleteRefreshToken: tokenStore.deleteRefreshToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
  parseDuration,
  ACCESS_EXPIRY,
  REFRESH_EXPIRY_SECONDS,
  ISSUER,
  AUDIENCE,
};
