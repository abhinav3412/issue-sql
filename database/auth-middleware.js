// Authentication and Authorization Middleware
// Provides server-side auth checks for API endpoints

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '7d';

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString();
}

/**
 * Generate JWT token for user
 * @param {Object} user - User object with id and role
 * @returns {string} JWT token
 */
function generateToken(user) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + (7 * 24 * 60 * 60) // Default 7 days
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(encodedHeader + '.' + encodedPayload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded token or null if invalid
 */
function verifyToken(token) {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(encodedHeader + '.' + encodedPayload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Extract token from request headers
 * @param {Object} request - Next.js request object
 * @returns {string|null} Token or null
 */
function extractToken(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Middleware to verify authentication
 * @param {Object} request - Next.js request object
 * @returns {Object|null} Decoded token with user info or null if invalid
 */
function requireAuth(request) {
  const token = extractToken(request);
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return null;
  }
  
  return decoded;
}

/**
 * Middleware to verify specific role
 * @param {Object} request - Next.js request object
 * @param {string|Array} requiredRole - Required role(s)
 * @returns {Object|null} Decoded token or null if not authorized
 */
function requireRole(request, requiredRole) {
  const auth = requireAuth(request);
  
  if (!auth) {
    return null;
  }
  
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  if (!roles.includes(auth.role)) {
    return null;
  }
  
  return auth;
}

/**
 * Middleware specifically for fuel station role
 * @param {Object} request - Next.js request object
 * @returns {Object|null} Decoded token or null if not a fuel station
 */
function requireFuelStation(request) {
  return requireRole(request, 'Fuel_Station');
}

/**
 * Middleware specifically for admin role
 * @param {Object} request - Next.js request object
 * @returns {Object|null} Decoded token or null if not an admin
 */
function requireAdmin(request) {
  return requireRole(request, 'Admin');
}

/**
 * Middleware specifically for worker role
 * @param {Object} request - Next.js request object
 * @returns {Object|null} Decoded token or null if not a worker
 */
function requireWorker(request) {
  return requireRole(request, 'Worker');
}

/**
 * Error response helper
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Object} Response object
 */
function errorResponse(message, status = 400) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Success response helper
 * @param {Object} data - Response data
 * @param {number} status - HTTP status code
 * @returns {Object} Response object
 */
function successResponse(data, status = 200) {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

module.exports = {
  generateToken,
  verifyToken,
  extractToken,
  requireAuth,
  requireRole,
  requireFuelStation,
  requireAdmin,
  requireWorker,
  errorResponse,
  successResponse,
  JWT_SECRET,
  TOKEN_EXPIRY,
};
