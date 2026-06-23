const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

passport.oauthProviders = passport.oauthProviders || {};

function buildFallbackName(profile, email) {
  const candidate =
    profile?.displayName ||
    [profile?.name?.givenName, profile?.name?.familyName].filter(Boolean).join(' ').trim() ||
    profile?.username ||
    (email ? email.split('@')[0] : '');

  return (candidate || 'OAuth User').trim();
}

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
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,   // from Google Cloud console
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/oauth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const normalizedName = buildFallbackName(profile, email);
        
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

          // Some legacy records were created without name; backfill before save to satisfy schema validation.
          if (!user.name || !user.name.trim()) {
            user.name = normalizedName;
          }

          await user.save();
          return done(null, user);
        }
        
        // Create new user if doesn't exist
        user = await User.create({
          name: normalizedName,
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
  passport.oauthProviders.google = true;
} else {
  passport.oauthProviders.google = false;
  console.warn('Google OAuth is disabled because GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.');
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || "/api/oauth/github/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;
        const normalizedName = buildFallbackName(profile, email);
        
        // First, check if user exists with this GitHub ID
        let user = await User.findOne({ githubId: profile.id });
        
        if (user) {
          return done(null, user);
        }
        
        // Check if user exists with this email
        user = await User.findOne({ email: email });
        
        if (user) {
          // User exists with email but not GitHub ID - link the accounts
          user.githubId = profile.id;

          // Keep OAuth linking resilient for legacy users with incomplete profile data.
          if (!user.name || !user.name.trim()) {
            user.name = normalizedName;
          }

          await user.save();
          return done(null, user);
        }
        
        // Create new user if doesn't exist
        user = await User.create({
          name: normalizedName,
          email: email,
          githubId: profile.id
        });
        
        done(null, user);
      } catch (err) {
        console.error('GitHub OAuth error:', err);
        done(err, null);
      }
    }
  ));
  passport.oauthProviders.github = true;
} else {
  passport.oauthProviders.github = false;
  console.warn('GitHub OAuth is disabled because GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is missing.');
}

module.exports = passport;
