const mongoose = require('mongoose');

describe('User Model', () => {
  let User;

  beforeAll(() => {
    User = require('../../../src/models/User');
  });

  it('should have the expected schema fields', () => {
    const schema = User.schema.obj;

    expect(schema.name).toBeDefined();
    expect(schema.name.type).toBe(String);
    expect(schema.name.required).toBe(true);

    expect(schema.email).toBeDefined();
    expect(schema.email.type).toBe(String);
    expect(schema.email.required).toBe(true);
    expect(schema.email.unique).toBe(true);

    expect(schema.password).toBeDefined();
    expect(schema.password.type).toBe(String);

    expect(schema.googleId).toBeDefined();
    expect(schema.googleId.type).toBe(String);
    expect(schema.googleId.sparse).toBe(true);

    expect(schema.githubId).toBeDefined();
    expect(schema.githubId.type).toBe(String);
    expect(schema.githubId.sparse).toBe(true);
  });

  it('should have timestamps enabled', () => {
    const options = User.schema.options;
    expect(options.timestamps).toBe(true);
  });

  it('should require password only when no OAuth id is set', () => {
    const schema = User.schema;
    const passwordPath = schema.path('password');

    const userWithoutOAuth = { name: 'Test', email: 'test@test.com' };
    expect(passwordPath.options.required.call(userWithoutOAuth)).toBe(true);

    const userWithGoogle = { name: 'Test', email: 'test@test.com', googleId: '123' };
    expect(passwordPath.options.required.call(userWithGoogle)).toBe(false);

    const userWithGithub = { name: 'Test', email: 'test@test.com', githubId: '456' };
    expect(passwordPath.options.required.call(userWithGithub)).toBe(false);
  });
});
