import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes.js";
import { adminApartmentRouter } from "../modules/apartments/admin-apartment.routes.js";
import { apartmentRouter } from "../modules/apartments/apartment.routes.js";
import { adminBookingRouter } from "../modules/bookings/admin-booking.routes.js";
import { bookingRouter } from "../modules/bookings/booking.routes.js";
import { adminDriverRouter } from "../modules/drivers/admin-driver.routes.js";
import { driverRouter } from "../modules/drivers/driver.routes.js";
import { adminEnquiryRouter } from "../modules/enquiries/admin-enquiry.routes.js";
import { enquiryRouter } from "../modules/enquiries/enquiry.routes.js";
import { mediaRouter } from "../modules/media/media.routes.js";
import { adminTaxiRouter } from "../modules/taxi/admin-taxi.routes.js";
import { taxiRouter } from "../modules/taxi/taxi.routes.js";
import { userRouter } from "../modules/users/user.routes.js";
import { adminBeds24Router } from "../modules/beds24/admin-beds24.routes.js";
import { agencyRouter } from "../modules/agencies/agency.routes.js";
import { adminAgencyRouter } from "../modules/agencies/admin-agency.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_request, response) => {
  response.status(200).json({
    success: true,
    message: "Malfranza API is running",
    timestamp: new Date().toISOString(),
  });
});

apiRouter.use("/apartments", apartmentRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/bookings", bookingRouter);
apiRouter.use("/taxi", taxiRouter);
apiRouter.use("/enquiries", enquiryRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/drivers", driverRouter);
apiRouter.use("/agencies", agencyRouter);
apiRouter.use("/admin/apartments", adminApartmentRouter);
apiRouter.use("/admin/bookings", adminBookingRouter);
apiRouter.use("/admin/agencies", adminAgencyRouter);
apiRouter.use("/admin/taxi", adminTaxiRouter);
apiRouter.use("/admin/drivers", adminDriverRouter);
apiRouter.use("/admin/enquiries", adminEnquiryRouter);
apiRouter.use("/admin/media", mediaRouter);
apiRouter.use("/admin/beds24", adminBeds24Router);
