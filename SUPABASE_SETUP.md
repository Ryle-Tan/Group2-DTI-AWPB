# Supabase Migration Guide

## Overview
This guide will help you migrate from the custom Express backend to Supabase.

## Prerequisites
- Supabase account (https://supabase.com)
- Node.js installed
- Git repository access

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up/login to your account
3. Click "New Project"
4. Choose your organization
5. Enter project details:
   - **Project Name**: `awpb-system`
   - **Database Password**: Choose a strong password
   - **Region**: Choose closest to your users
6. Click "Create new project"
7. Wait for project to be ready (2-3 minutes)

## Step 2: Get Project Credentials

1. In your Supabase project, go to **Settings** → **API**
2. Copy the **Project URL** and **anon public** key
3. Create `frontend/.env` from `frontend/.env.example`
4. Set the Supabase credentials:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-anon-key-here
```

For deployed password reset emails, also set the frontend origin:

```bash
VITE_APP_URL=https://your-app.vercel.app
```

## Step 3: Run Database Migrations

### Option A: Using Supabase Dashboard (Recommended)
1. Go to **SQL Editor** in your Supabase project
2. Run every file in `supabase/migrations/` in numeric order, from:
   - `001_create_awpb_schema.sql`
   - through `032_allow_retry_incomplete_archive_cleanup.sql`
3. Do not skip later migrations. They include account-management RPCs, password policy enforcement, RLS hardening, review actions, planning estimates, pending-entry deletion support, and archive cleanup behavior.

### Option B: Using Supabase CLI
1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```
2. Link your project:
   ```bash
   supabase link --project-ref your-project-id
   ```
3. Run migrations:
   ```bash
   supabase db push
   ```

## Step 4: Install Frontend Dependencies

```bash
cd frontend
npm install @supabase/supabase-js
```

## Step 5: Update Frontend Components

Replace API calls with Supabase services:

### Before (Custom API):
```javascript
import { usersAPI } from '../services/api';
const users = await usersAPI.getAll();
```

### After (Supabase):
```javascript
import { usersService } from '../services/supabaseService';
const users = await usersService.getAll();
```

## Step 6: Update Authentication

### Login Component Update:
```javascript
import { authService } from '../services/supabaseService';

const handleLogin = async (email, password) => {
  try {
    const { user } = await authService.signIn(email, password);
    // Handle successful login
  } catch (error) {
    // Handle error
  }
};
```

## Step 7: Test the Migration

1. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

2. Test authentication:
   - Try to sign up a new user
   - Try to login with existing credentials

3. Test data operations:
   - Create entries
   - View entries list
   - Update entries

## Step 8: Create Default Admin User

Run this in Supabase SQL Editor:

```sql
-- Create admin user (replace with actual email)
INSERT INTO auth.users (
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data
) VALUES (
  'admin@dti.gov.ph',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"username": "adm_admin", "full_name": "Default Admin", "role": "admin"}'
);

-- The trigger will automatically create the profile
```

## Step 9: Remove Backend Code (Optional)

Once migration is complete, you can remove:
- `backend/` directory
- Custom API service files
- Environment variables for backend

## Step 10: Deploy Updates

1. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: Migrate to Supabase backend"
   git push
   ```

2. Deploy frontend to your hosting platform

3. Configure Supabase Auth redirect URLs:
   - Go to **Authentication** → **URL Configuration**
   - Set **Site URL** to your deployed frontend URL, for example `https://your-app.vercel.app`
   - Add this exact redirect URL to **Redirect URLs**: `https://your-app.vercel.app/confirm-password`
   - If you use Vercel preview deployments, add a wildcard redirect such as `https://*.vercel.app/confirm-password`

4. In Vercel, add these frontend environment variables and redeploy:
   ```bash
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-actual-anon-key-here
   VITE_APP_URL=https://your-app.vercel.app
   ```

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Make sure your frontend URL is added to Supabase CORS settings
   - Go to Settings → API → CORS
   - Add your frontend URL (e.g., `http://localhost:5173`)

2. **RLS Permission Denied**: Check that RLS policies are correctly set up
   - Run the migration files again if needed

3. **Authentication Issues**: Verify email confirmation settings
   - Go to Authentication → Settings
   - Disable "Enable email confirmations" for testing

4. **Password reset link opens localhost**: Update the Supabase Auth URL Configuration
   - Set **Site URL** to the deployed Vercel URL, not `http://localhost:5173`
   - Add `https://your-app.vercel.app/confirm-password` to **Redirect URLs**
   - Make sure Vercel has `VITE_APP_URL=https://your-app.vercel.app`
   - Redeploy the frontend and request a new reset email

5. **Missing Data**: Check that seed data was properly inserted
   - Go to Table Editor to verify data exists

## Benefits of Supabase Migration

✅ **Real-time Updates**: Automatic real-time data sync
✅ **Authentication**: Built-in auth with social providers
✅ **Security**: Row Level Security (RLS) out of the box
✅ **Scalability**: Managed PostgreSQL database
✅ **API Generation**: Auto-generated REST API
✅ **File Storage**: Built-in file storage for uploads
✅ **Edge Functions**: Serverless functions when needed

## Next Steps

1. Set up real-time subscriptions for live updates
2. Configure file storage for document uploads
3. Set up automated backups
4. Configure monitoring and analytics
5. Set up CI/CD for database migrations
