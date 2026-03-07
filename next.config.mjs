import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://10.0.2.15:3000",
    "http://10.0.2.15:3001",
    "http://192.168.56.1:3000",
    "http://192.168.56.1:3001",
    "https://192.168.56.1:3000",
    "https://192.168.56.1:3001",
  ],
  turbopack: {
    // Ensure the workspace root is this project directory so process.cwd()
    // points here in dev and our database path resolves correctly.
    root: __dirname,
  },
};

export default nextConfig;
