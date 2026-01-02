if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const mongoose = require("mongoose");
const express = require("express");
const app = express();
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");

// ROUTERS
const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");
const bookingRouter = require("./routes/booking.js");

// Razorpay verification dependencies
const crypto = require("crypto");

const dbUrl = process.env.ATLASDB_URL;
const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";

async function main() {
    await mongoose.connect(dbUrl || MONGO_URL);
    console.log("Connected to DB");
    await ensureListingIndexes();
}
main().catch(err => console.log(err));


// -------------------- DATABASE --------------------
async function ensureListingIndexes() {
    try {
        const collection = mongoose.connection.db.collection("listings");
        const indexes = await collection.indexes();
        const titleIndex = indexes.find((idx) => idx.name === "title_1" && idx.unique);
        if (titleIndex) {
            await collection.dropIndex("title_1");
            console.log("Dropped legacy unique index title_1 on listings");
        }
    } catch (err) {
        console.warn("Index cleanup skipped:", err.message);
    }
}


// -------------------- VIEW ENGINE --------------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);


// -------------------- MIDDLEWARE --------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "/public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


// -------------------- SESSION --------------------
const sessionOptions = {
    secret: "mysupersecretcode",
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};

app.use(session(sessionOptions));
app.use(flash());


// -------------------- PASSPORT --------------------
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


// -------------------- GLOBAL VARIABLES --------------------
app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currentUser = req.user;
    res.locals.currUser = req.user;
    next();
});


// -------------------- ROUTES --------------------
app.get("/", (req, res) => {
    res.redirect("/listings");
});

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);
app.use("/", bookingRouter);


// -------------------- PAYMENT VERIFY (Razorpay) --------------------
app.post("/payment/verify", async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const sign = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (expectedSign === razorpay_signature) {
            console.log("PAYMENT VERIFIED ✔");
            return res.json({ success: true });
        }

        console.log("INVALID SIGNATURE ❌");
        res.status(400).json({ success: false });

    } catch (err) {
        console.log("VERIFY ERROR:", err);
        res.status(500).json({ success: false });
    }
});


// -------------------- CANCEL PAGE (optional) --------------------
app.get("/cancel", (req, res) => {
    res.redirect("/bookings");
});


// -------------------- STATIC PAGES --------------------
app.get("/privacy", (req, res) => res.render("privacy.ejs"));
app.get("/terms", (req, res) => res.render("terms.ejs"));


// -------------------- 404 HANDLER --------------------
app.all(/(.*)/, (req, res, next) => {
    next(new ExpressError(404, "Page Not Found"));
});


// -------------------- ERROR HANDLER --------------------
app.use((err, req, res, next) => {
    const { statusCode = 500, message = "Something went wrong" } = err;
    res.status(statusCode).render("error.ejs", { message });
});


// -------------------- SERVER --------------------
// Export the app for Vercel (serverless function)
module.exports = app;

// Only listen if this file is run directly (not imported)
if (require.main === module) {
    app.listen(8080, () => {
        console.log("Server is running on port 8080");
    });
}
