# Setting Up Your First Admin User

## Step 1: Create Admin User in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Users**
3. Click **Add User**
4. Fill in:
   - **Email**: `admin@local`
   - **Password**: `your-secure-password`
   - **Email Confirm**: ✅ (check this box)

## Step 2: Add Admin Role

1. After user is created, click on the user
2. Go to **User Metadata** tab
3. In **Raw User Meta Data**, add:
   ```json
   {
     "role": "admin"
   }
   ```
4. Save changes

## Step 3: Test Login

1. Start the development server: `yarn start`
2. You should see the login page
3. Login with:
   - **Username**: `admin`
   - **Password**: `your-secure-password`

## User Creation Examples

### Username-only users:
- Email: `john@local`
- User logs in with: `john`

### Email users:
- Email: `user@company.com` 
- User logs in with: `user@company.com`

### Admin users:
- Email: `admin@local`
- Metadata: `{"role": "admin"}`
- User logs in with: `admin`