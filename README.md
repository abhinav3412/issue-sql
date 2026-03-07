# Next.js Login Example

This project is a minimal **Next.js (App Router)** app with:

- A `/login` page with a styled login form
- A `/dashboard` page that acts as the "home" after login
- A redirect from `/` to `/login`

> Note: This project was scaffolded without running `create-next-app`, so you need **Node.js and npm** installed to run it.

## Prerequisites

- Install **Node.js LTS** (which includes npm) from the official website: `https://nodejs.org/`

After installing, restart your terminal and run:

```bash
node -v
npm -v
```

Both commands should print versions (no "not recognized" errors).

## Install dependencies

From the project root (`C:\\Users\\abhin\\Desktop\\test1`), run:

```bash
npm install
```

This will download `next`, `react`, `react-dom`, TypeScript, and ESLint.

## Run the dev server

Then start the development server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

-

On successful login you will be navigated to `/dashboard`.

add .env and .env.local files
.env
# https://www.builder.io/c/docs/using-your-api-key
NEXT_PUBLIC_BUILDER_API_KEY=

# SMTP Configuration for real email sending
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
APP_URL=

# Razorpay Configuration (Get these from https://dashboard.razorpay.com/app/keys)
NEXT_PUBLIC_RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# RazorpayX Configuration (For Payouts - Enable RazorpayX first)
# Get your account number from: https://x.razorpay.com/
# Note: RazorpayX is a separate product that needs to be enabled on your Razorpay account
RAZORPAY_ACCOUNT_NUMBER=your_razorpayx_account_number_here

# Encryption key for sensitive data (bank details, etc.)
# WARNING: Don't change this if you have existing encrypted data in the database!
ENCRYPTION_KEY=default-32-byte-key-placeholder-32



.env.local

NEXT_PUBLIC_SUPABASE_ANON_KEY=" "
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" "
NEXT_PUBLIC_SUPABASE_URL=" "
POSTGRES_DATABASE=" "
POSTGRES_HOST=" "
POSTGRES_PASSWORD=" "
POSTGRES_PRISMA_URL=" "
POSTGRES_URL=" "
POSTGRES_URL_NON_POOLING=" "
POSTGRES_USER=" "
SUPABASE_ANON_KEY=" "
SUPABASE_JWT_SECRET=" "
SUPABASE_PUBLISHABLE_KEY=" "
SUPABASE_SECRET_KEY=" "
SUPABASE_SERVICE_ROLE_KEY=" "
SUPABASE_URL=" "
DB_CLIENT="postgres"
DATABASE_URL=" "
ADMIN_EMAIL=" "
ADMIN_PASSWORD=" "
