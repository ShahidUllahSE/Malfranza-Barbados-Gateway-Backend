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
apiRouter.use("/admin/apartments", adminApartmentRouter);
apiRouter.use("/admin/bookings", adminBookingRouter);
apiRouter.use("/admin/taxi", adminTaxiRouter);
apiRouter.use("/admin/drivers", adminDriverRouter);
apiRouter.use("/admin/enquiries", adminEnquiryRouter);
apiRouter.use("/admin/media", mediaRouter);
