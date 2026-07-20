# Malfranza Barbados Gateway API

Separate Node.js, TypeScript, Express and MongoDB backend for the Malfranza frontend.

## Structure

```text
src/
  config/                 Environment and database setup
  middleware/             Shared Express middleware
  routes/                 API router
  modules/
    apartments/           Apartment catalogue and availability
    auth/                 Admin authentication and roles
    bookings/             Apartment bookings
    taxi/                 Fare estimates and taxi bookings
    enquiries/            Contact enquiries
    payments/             PayPal integration
    notifications/        Transactional email
  app.ts                  Express configuration
  server.ts               Database and HTTP server startup
```

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI`.
3. Run `npm install`.
4. Run `npm run dev`.

Health endpoint: `GET /api/v1/health`

## Authentication

- `POST /api/v1/auth/bootstrap` — create the first admin using `ADMIN_BOOTSTRAP_KEY`
- `POST /api/v1/auth/login` — receive a Bearer access token
- `GET /api/v1/auth/me` — return the authenticated admin

## Booking endpoints

Public:

- `GET /api/v1/bookings/availability`
- `POST /api/v1/bookings`
- `GET /api/v1/bookings/:reference?email=guest@example.com`

Admin (Bearer token required):

- `GET /api/v1/admin/bookings`
- `GET /api/v1/admin/bookings/:id`
- `PATCH /api/v1/admin/bookings/:id/status`
- `PATCH /api/v1/admin/bookings/:id/payment` — admin role only
- `DELETE /api/v1/admin/bookings/:id` — safely cancels rather than deleting

## Apartment endpoints

Public:

- `GET /api/v1/apartments`
- `GET /api/v1/apartments/:slug`

Admin (Bearer token required):

- `GET /api/v1/admin/apartments`
- `GET /api/v1/admin/apartments/:id`
- `POST /api/v1/admin/apartments` — admin role only
- `PATCH /api/v1/admin/apartments/:id`
- `DELETE /api/v1/admin/apartments/:id` — admin role only, safely deactivates

Run `npm run seed:apartments` once MongoDB Atlas allows your current IP to insert the five initial catalogue records.

## Taxi endpoints

Public:

- `POST /api/v1/taxi/fare-estimate`
- `POST /api/v1/taxi/bookings`
- `GET /api/v1/taxi/bookings/:reference?email=guest@example.com`

Admin (Bearer token required):

- `GET /api/v1/admin/taxi`
- `GET /api/v1/admin/taxi/:id`
- `PATCH /api/v1/admin/taxi/:id/status`
- `DELETE /api/v1/admin/taxi/:id` — admin role only, safely cancels

Fare estimation requires `GOOGLE_MAPS_API_KEY` with the Google Routes API enabled.

## Enquiry endpoints

Public:

- `POST /api/v1/enquiries`

Admin (Bearer token required):

- `GET /api/v1/admin/enquiries`
- `GET /api/v1/admin/enquiries/:id`
- `PATCH /api/v1/admin/enquiries/:id`
- `DELETE /api/v1/admin/enquiries/:id` — admin role only, safely closes

## Media endpoints

Admin (Bearer token required):

- `POST /api/v1/admin/media/images` — multipart Cloudinary image upload
- `DELETE /api/v1/admin/media/images` — admin role only

Cloudinary credentials belong only in the backend `.env`; never expose the API secret through a `VITE_` variable or frontend code.

Run `npm run seed:apartment-media` to upload the original apartment photos and attach their Cloudinary URLs to the seeded MongoDB apartments.
