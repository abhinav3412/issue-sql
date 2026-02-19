/**
 * Distance Calculator - Haversine Formula Implementation
 * Calculates great-circle distance between two points on Earth
 */

const EARTH_RADIUS_KM = 6371; // Earth's radius in kilometers

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate distance between two geographic points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  // Ensure all inputs are numbers
  lat1 = Number(lat1);
  lng1 = Number(lng1);
  lat2 = Number(lat2);
  lng2 = Number(lng2);

  // Validate inputs
  if (
    Number.isNaN(lat1) ||
    Number.isNaN(lng1) ||
    Number.isNaN(lat2) ||
    Number.isNaN(lng2)
  ) {
    throw new Error("Invalid coordinates: all values must be numbers");
  }

  // Convert to radians
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  // Haversine formula
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  // Return rounded to 2 decimal places
  return Math.round(distance * 100) / 100;
}

/**
 * Calculate distances from a point to multiple destinations
 * @param {number} lat - Origin latitude
 * @param {number} lng - Origin longitude
 * @param {Array} destinations - Array of {lat, lng, id, name} objects
 * @returns {Array} Array of destinations with calculated distances, sorted by distance
 */
function calculateDistances(lat, lng, destinations) {
  if (!Array.isArray(destinations)) {
    throw new Error("Destinations must be an array");
  }

  const withDistances = destinations.map((dest) => ({
    ...dest,
    distance_km: haversineDistance(lat, lng, dest.lat, dest.lng),
  }));

  // Sort by distance ascending
  return withDistances.sort((a, b) => a.distance_km - b.distance_km);
}

/**
 * Find nearest destination within optional max radius
 * @param {number} lat - Origin latitude
 * @param {number} lng - Origin longitude
 * @param {Array} destinations - Array of destinations with lat/lng
 * @param {number} maxRadiusKm - Maximum search radius in km (optional)
 * @returns {Object|null} Nearest destination or null if none found within radius
 */
function findNearest(lat, lng, destinations, maxRadiusKm = null) {
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return null;
  }

  const withDistances = calculateDistances(lat, lng, destinations);

  if (maxRadiusKm !== null && maxRadiusKm !== undefined) {
    const filtered = withDistances.filter((d) => d.distance_km <= maxRadiusKm);
    return filtered.length > 0 ? filtered[0] : null;
  }

  return withDistances[0];
}

/**
 * Filter destinations by maximum distance
 * @param {number} lat - Origin latitude
 * @param {number} lng - Origin longitude
 * @param {Array} destinations - Array of destinations
 * @param {number} maxDistanceKm - Maximum distance in km
 * @returns {Array} Destinations within max distance, sorted by distance
 */
function filterByDistance(lat, lng, destinations, maxDistanceKm) {
  const withDistances = calculateDistances(lat, lng, destinations);
  return withDistances.filter((d) => d.distance_km <= maxDistanceKm);
}

/**
 * Create a distance matrix between an origin and multiple destinations
 * Useful for visualization and analytics
 * @param {number} lat - Origin latitude
 * @param {number} lng - Origin longitude
 * @param {Array} destinations - Array of destinations
 * @returns {Object} Distance matrix with summary statistics
 */
function createDistanceMatrix(lat, lng, destinations) {
  const withDistances = calculateDistances(lat, lng, destinations);

  const distances = withDistances.map((d) => d.distance_km);
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);
  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

  return {
    origin: { lat, lng },
    destinations: withDistances,
    summary: {
      total_destinations: withDistances.length,
      min_distance_km: minDistance,
      max_distance_km: maxDistance,
      avg_distance_km: Math.round(avgDistance * 100) / 100,
    },
  };
}

/**
 * Check if location has moved beyond threshold distance
 * Useful for determining if recalculation is needed
 * @param {number} lat1 - Previous latitude
 * @param {number} lng1 - Previous longitude
 * @param {number} lat2 - Current latitude
 * @param {number} lng2 - Current longitude
 * @param {number} thresholdKm - Threshold distance in km
 * @returns {boolean} True if distance exceeds threshold
 */
function hasMovedBeyondThreshold(lat1, lng1, lat2, lng2, thresholdKm = 0.5) {
  const distance = haversineDistance(lat1, lng1, lat2, lng2);
  return distance > thresholdKm;
}

module.exports = {
  haversineDistance,
  calculateDistances,
  findNearest,
  filterByDistance,
  createDistanceMatrix,
  hasMovedBeyondThreshold,
  EARTH_RADIUS_KM,
};
