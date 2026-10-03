# Student ReCraft 🎓🔄

A peer-to-peer campus circular economy platform built with **Node.js, Express.js, Supabase PostgreSQL, and Bootstrap 5**, deployable instantly on **Vercel**.

Students often need equipment, books, or lab supplies for a short period (a single exam, a course, or a weekend project), while other students have unused items lying around in their dorm rooms. **ReCraft** connects students within the same campus to rent, borrow for free, or giveaway unused items safely.

---

## 1. What the Platform Does

* **Rent:** Rent calculators, drafting machines, cameras, bikes, or monitors by the day (in Indian Rupees ₹).
* **Borrow for Free:** Share textbooks, lab coats, and revision notes with peers at no charge (refundable security deposit only).
* **Reuse / Giveaway:** Pass on items you no longer need when graduating or moving (flat total price in ₹ or free).
* **Campus Trust:** Peer accounts, verified student profiles, request workflows, and safe meeting spot coordination.
* **REST API & SSR:** Dual architecture supporting both server-side rendered web UI and REST API endpoints.

---

## 2. Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: Supabase PostgreSQL (`@supabase/supabase-js`)
- **Authentication**: JWT tokens in httpOnly cookies (SSR) and `Authorization: Bearer <token>` headers (REST API)
- **Frontend / Templating**: Nunjucks (fully compatible with existing UI and styling) + Bootstrap 5
- **Image Storage**: Supabase Storage (`item-images` public bucket) with local fallback
- **Deployment**: Vercel Serverless (`vercel.json` + `api/index.js`)

---

## 3. Quick Start (Local Development)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your Supabase credentials:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
JWT_SECRET=your-secure-random-jwt-secret-key-campus-2026
PORT=5000
```
*(Note: If you run without Supabase credentials, the application automatically runs in development mode with an in-memory seed database so you can test immediately!)*

### Step 3: Run the Application
```bash
npm start
# or
node server.js
```
Open your browser and navigate to:
```
http://localhost:5000
```

### Step 4: Run Automated Tests
```bash
npm test
```

---

## 4. Setting Up Supabase Database

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In the Supabase Dashboard, open the **SQL Editor** (`</>`).
3. Click **New query**, paste the entire content of [`supabase_schema.sql`](file:///c:/Users/User/Downloads/project1/supabase_schema.sql), and click **Run**.
4. This will create:
   - `users`, `items`, `rental_requests`, `request_messages`, `reports` tables.
   - Storage bucket `item-images` with public read access.
   - Initial sample items priced in Indian Rupees (₹).
5. In **Project Settings** -> **API**, copy:
   - **Project URL** -> `SUPABASE_URL`
   - **Project API Keys** -> `anon` `public` -> `SUPABASE_ANON_KEY`

---

## 5. Deploying to Vercel

### Option A: Deploy via GitHub & Vercel Dashboard (Recommended)
1. Push this repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and click **Add New** -> **Project**.
3. Import your GitHub repository.
4. In the **Environment Variables** section, add:
   - `SUPABASE_URL`: Your Supabase Project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon public key
   - `JWT_SECRET`: A strong random string for signing JWT tokens
5. Click **Deploy**. Vercel will build and launch your application globally!

### Option B: Deploy via Vercel CLI
```bash
npm install -g vercel
vercel login
vercel
```
When prompted, select project defaults and provide your environment variables in the Vercel dashboard.

---

## 6. REST API Reference

All API routes return JSON responses and support JWT authentication via `Authorization: Bearer <token>` or browser cookies.

### Authentication
- `POST /api/auth/signup` - Register a new campus student account
- `POST /api/auth/login` - Authenticate student and obtain JWT
- `POST /api/auth/logout` - Clear session token
- `GET /api/auth/me` - Get current authenticated user profile *(Requires Auth)*

### Items & Listings
- `GET /api/items` - List items with search (`q`), `category`, `item_type`, and `sort`
- `GET /api/items/:id` - Detailed item view with owner info
- `POST /api/items` - Publish a new item with image *(Requires Auth)*
- `PUT /api/items/:id` - Update existing item listing *(Requires Auth + Owner)*
- `DELETE /api/items/:id` - Delete item listing *(Requires Auth + Owner)*

### Requests & Handover
- `GET /api/requests` - Retrieve incoming and outgoing requests *(Requires Auth)*
- `GET /api/requests/:id` - Request details and message thread *(Requires Auth)*
- `POST /api/requests` - Submit a new rental or borrow request *(Requires Auth)*
- `POST /api/requests/:id/respond/:action` - Accept or reject request *(Requires Auth + Owner)*
- `POST /api/requests/:id/messages` - Send internal message on request thread *(Requires Auth)*

### Users & Trust
- `GET /api/users/:id` - Public student profile, campus info, and listings
- `POST /api/reports` - Report an item or user to campus safety moderators *(Requires Auth)*

---

## 7. Sample Accounts

All seed accounts use the default password: `password123`
- **Owner Demo:** `alex@campus.edu` (Engineering student with drafting machine and calculator)
- **Borrower Demo:** `priya@campus.edu` (Science student with chemistry lab coats)
- **Renter Demo:** `marcus@campus.edu` (Architecture student with commuter bicycle)
