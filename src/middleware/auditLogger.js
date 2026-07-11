const Audit = require('../models/Audit');

async function logAudit({ userId, action, resource, resourceId, details, ip, userAgent }) {
  try {
    await Audit.create({
      userId,
      action,
      resource,
      resourceId,
      details,
      ip: ip || 'unknown',
      userAgent: userAgent || 'unknown',
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

function auditMiddleware(action, resource) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      logAudit({
        userId: req.user?._id || req.user?.id,
        action,
        resource: typeof resource === 'function' ? resource(req) : resource,
        resourceId: req.params?.id || body?.id || body?.resume?.id,
        details: { statusCode: res.statusCode, method: req.method, path: req.path },
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return originalJson(body);
    };
    next();
  };
}

module.exports = { logAudit, auditMiddleware };
