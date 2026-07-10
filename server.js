require('dotenv').config();
const connectDB = require('./src/config/db');
const secrets = require('./src/config/secrets');
const { validateEnv } = require('./src/config/validateEnv');
const app = require("./src/app");

const PORT = process.env.PORT || 4000;

async function startServer() {
	try {
		// Load secrets from AWS Parameter Store in production
		await secrets.initialize();

		// Validate environment variables
		validateEnv();

		// Connect to MongoDB before accepting requests so startup failures are explicit.
		await connectDB();
		app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
	} catch (error) {
		console.error('❌ Server startup failed because MongoDB could not be initialized.');
		console.error('   - See the connection error details above for the root cause.');
		process.exit(1);
	}
}

startServer();
