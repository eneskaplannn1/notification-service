# Deploying Notification Service on Vercel

This guide will help you deploy the plant care notification service on Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI**: Install with `npm i -g vercel`
3. **Supabase Project**: Ensure your Supabase project is set up with the required tables

## Required Database Tables

Make sure you have these tables in your Supabase database:

1. **notification_users** - Stores user push tokens
2. **care_reminders** - Stores plant care reminders
3. **notification_logs** - Logs notification activities
4. **user_plants** - Links users to their plants
5. **users** - User information

Run the migration in `care_reminders_migration.sql` if you haven't already.

## Deployment Steps

### 1. Install Dependencies

```bash
cd notification
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the notification directory:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Deploy to Vercel

#### Option A: Using Vercel CLI

```bash
# Login to Vercel (if not already logged in)
vercel login

# Deploy the project
vercel

# Follow the prompts:
# - Set up and deploy: Yes
# - Which scope: Select your account
# - Link to existing project: No
# - Project name: plant-notification-service (or your preferred name)
# - Directory: ./ (current directory)
```

#### Option B: Using Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Set the root directory to `notification`
5. Configure environment variables (see step 4)

### 4. Configure Environment Variables in Vercel

After deployment, go to your project settings in Vercel:

1. Navigate to Settings → Environment Variables
2. Add the following variables:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key

### 5. Set Up Cron Job for Reminders

Since Vercel doesn't support traditional cron jobs, you have several options:

#### Option A: Use Vercel Cron Jobs (Recommended)

If you have a Vercel Pro account, you can use Vercel Cron Jobs:

1. Go to your project settings
2. Navigate to Functions → Cron Jobs
3. Add a new cron job:
   - **Path**: `/api/cron-reminders`
   - **Schedule**: `*/5 * * * *` (every 5 minutes)

#### Option B: Use External Cron Service

Use services like [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com):

1. Create an account on your preferred cron service
2. Set up a cron job to call: `https://your-vercel-domain.vercel.app/api/cron-reminders`
3. Set the schedule to every 5 minutes

#### Option C: Use GitHub Actions

Create a GitHub Action to trigger the cron endpoint:

```yaml
# .github/workflows/cron-reminders.yml
name: Cron Reminders
on:
  schedule:
    - cron: "*/5 * * * *" # Every 5 minutes

jobs:
  trigger-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger reminder processing
        run: |
          curl -X GET https://your-vercel-domain.vercel.app/api/cron-reminders
```

## API Endpoints

After deployment, your service will be available at:

- **Health Check**: `GET https://your-domain.vercel.app/api/health`
- **Send to All Users**: `POST https://your-domain.vercel.app/api/notify-all`
- **Send to Specific Users**: `POST https://your-domain.vercel.app/api/notify-users`
- **Process Reminders**: `POST https://your-domain.vercel.app/api/notify-reminders`
- **Cron Reminders**: `GET/POST https://your-domain.vercel.app/api/cron-reminders`

## Testing the Deployment

### 1. Test Health Endpoint

```bash
curl https://your-domain.vercel.app/api/health
```

Expected response:

```json
{
  "status": "OK",
  "message": "Notification service is running",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. Test Notification Endpoint

```bash
curl -X POST https://your-domain.vercel.app/api/notify-all \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Notification",
    "body": "This is a test notification from Vercel",
    "data": {"test": true}
  }'
```

### 3. Test Cron Endpoint

```bash
curl https://your-domain.vercel.app/api/cron-reminders
```

## Monitoring and Logs

- **Vercel Logs**: View function logs in your Vercel dashboard
- **Supabase Logs**: Check the `notification_logs` table for notification activity
- **Function Analytics**: Monitor function performance in Vercel dashboard

## Troubleshooting

### Common Issues

1. **Environment Variables Not Set**

   - Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are configured in Vercel
   - Redeploy after adding environment variables

2. **Database Connection Issues**

   - Verify your Supabase credentials
   - Check if your Supabase project is active
   - Ensure the required tables exist

3. **CORS Issues**

   - The API endpoints include CORS headers for cross-origin requests
   - If you need to restrict origins, modify the CORS headers in each function

4. **Function Timeout**
   - Functions are configured with 30-second timeouts
   - For large notification batches, consider batching or using background jobs

### Performance Optimization

1. **Database Indexing**: Ensure your Supabase tables have proper indexes
2. **Connection Pooling**: Supabase handles connection pooling automatically
3. **Caching**: Consider implementing caching for frequently accessed data

## Security Considerations

1. **Environment Variables**: Never commit sensitive data to your repository
2. **API Access**: Consider implementing authentication for your endpoints
3. **Rate Limiting**: Vercel provides built-in rate limiting
4. **Input Validation**: All endpoints include basic input validation

## Cost Considerations

- **Vercel Hobby Plan**: Free tier includes 100GB-hours of serverless function execution
- **Vercel Pro Plan**: $20/month includes more generous limits and cron jobs
- **Supabase**: Free tier includes 500MB database and 50,000 monthly active users

## Next Steps

1. Update your mobile app to use the new Vercel endpoints
2. Set up monitoring and alerting
3. Configure proper error handling in your mobile app
4. Test the complete notification flow end-to-end
