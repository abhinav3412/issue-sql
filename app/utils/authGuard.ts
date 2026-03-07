// Client-side authentication and authorization utilities

export type UserRole = 'User' | 'Worker' | 'Admin' | 'Station' | 'Fuel_Station';

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone_number?: string;
  token?: string;
  // Fuel station specific
  station_name?: string;
  is_verified?: boolean;
  cod_enabled?: boolean;
}

/**
 * Get current user from localStorage
 */
export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  const userStr = localStorage.getItem('agf_user');
  if (!userStr) return null;

  try {
    return JSON.parse(userStr) as AuthUser;
  } catch (e) {
    console.error('Failed to parse user from localStorage:', e);
    return null;
  }
}

/**
 * Get auth token from localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('agf_token') || null;
}

/**
 * Store user and token in localStorage
 */
export function setAuthUser(user: AuthUser, token?: string) {
  if (typeof window === 'undefined') return;

  localStorage.setItem('agf_user', JSON.stringify(user));
  if (token) {
    localStorage.setItem('agf_token', token);
  }
}

/**
 * Clear auth data
 */
export function clearAuth() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('agf_user');
  localStorage.removeItem('agf_token');
}

/**
 * Check if user has specific role
 */
export function hasRole(role: UserRole | UserRole[]): boolean {
  const user = getCurrentUser();
  if (!user) return false;

  const roles = Array.isArray(role) ? role : [role];
  return roles.includes(user.role);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

/**
 * Check if user is fuel station
 */
export function isFuelStation(): boolean {
  return hasRole(['Station', 'Fuel_Station']);
}

/**
 * Check if user is admin
 */
export function isAdmin(): boolean {
  return hasRole('Admin');
}

/**
 * Check if user is worker
 */
export function isWorker(): boolean {
  return hasRole('Worker');
}

/**
 * Check if user is regular user
 */
export function isUser(): boolean {
  return hasRole('User');
}

/**
 * Get user's full name
 */
export function getUserFullName(): string {
  const user = getCurrentUser();
  if (!user) return '';

  if (user.role === 'Station' || user.role === 'Fuel_Station') {
    return user.station_name || `${user.first_name} ${user.last_name}`;
  }

  return `${user.first_name} ${user.last_name}`;
}

/**
 * Get API headers with authentication token
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}
