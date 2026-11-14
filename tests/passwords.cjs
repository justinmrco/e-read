// Real native bcrypt and model middleware; no database or credentials needed.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const bcrypt = backendRequire('bcrypt');
const User = backendRequire('./models/User');

async function main() {
  for (const prefix of ['$2a$', '$2b$']) {
    const hash = await bcrypt.hash('synthetic-password', prefix + '10$' + 'a'.repeat(22));
    assert(await bcrypt.compare('synthetic-password', hash));
    assert(!(await bcrypt.compare('incorrect', hash)));
  }
  const user = new User({ username: 'Synthetic', email: 'synthetic@example.com', password: 'synthetic-password' });
  await new Promise((resolve, reject) => {
    User.schema.s.hooks.execPre('save', user, [], error => error ? reject(error) : resolve());
  });
  assert.notEqual(user.password, 'synthetic-password');
  assert(await user.comparePassword('synthetic-password'));
  assert(!(await user.comparePassword('incorrect')));
  assert.equal(user.tokenVersion, 0);
  console.log('Native bcrypt, legacy hash formats, and User password middleware passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
