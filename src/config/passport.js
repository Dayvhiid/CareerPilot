const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Serialize user (stores user ID in session)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user (retrieves user by ID)
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,   // from Google Cloud console
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/oauth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      
      // First, check if user exists with this Google ID
      let user = await User.findOne({ googleId: profile.id });
      
      if (user) {
        return done(null, user);
      }
      
      // Check if user exists with this email
      user = await User.findOne({ email: email });
      
      if (user) {
        // User exists with email but not Google ID - link the accounts
        user.googleId = profile.id;
        await user.save();
        return done(null, user);
      }
      
      // Create new user if doesn't exist
      user = await User.create({
        name: profile.displayName,
        email: email,
        googleId: profile.id
      });
      
      done(null, user);
    } catch (err) {
      console.error('OAuth error:', err);
      done(err, null);
    }
  }
));

module.exports = passport;
