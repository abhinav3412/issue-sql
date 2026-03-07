"use client";

export default function RedirectToLocalhost() {
  // Disabled: this component was causing mixed content warnings by forcing
  // redirects from HTTPS to HTTP localhost. The app now works on any domain.
  return null;
}
