const mongoose = require("mongoose");

let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        console.log("MongoDB connection already established");
        return;
    }

    try {
        await mongoose.connect(process.env.ATLASDB_URL);
        isConnected = true;
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("Mongo error:", err);
        process.exit(1);
    }
};

module.exports = connectDB;
