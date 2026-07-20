const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('./image-utils.js', 'utf8');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(code, context);

const utils = context.window.EduPathImageUtils;

assert.strictEqual(
  utils.normalizeImageUrl('https://github.com/username/repository/blob/main/images/logo.png'),
  'https://raw.githubusercontent.com/username/repository/main/images/logo.png'
);

assert.strictEqual(
  utils.normalizeImageUrl('https://raw.githubusercontent.com/username/repository/main/images/logo.png'),
  'https://raw.githubusercontent.com/username/repository/main/images/logo.png'
);

assert.strictEqual(
  utils.normalizeImageUrl('https://github.com/username/repository/blob/main/images/profile.jpg?raw=true'),
  'https://raw.githubusercontent.com/username/repository/main/images/profile.jpg'
);

assert.strictEqual(utils.isValidImageUrl('https://raw.githubusercontent.com/user/repo/main/images/photo.png'), true);
assert.strictEqual(utils.isValidImageUrl('https://example.com/photo.jpg'), true);
assert.strictEqual(utils.isValidImageUrl('C:\\Users\\name\\Desktop\\photo.png'), false);
assert.strictEqual(utils.isValidImageUrl('https://github.com/user/repo/blob/main/images/photo.png'), true);

console.log('image utils tests passed');
