require('dotenv').config();
const connectDB = require('./src/config/db');
const app = require("./src/app");

// Connect to MongoDB
connectDB();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
