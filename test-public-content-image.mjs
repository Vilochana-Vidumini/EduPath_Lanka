import assert from 'node:assert/strict';
import { getRecordImage } from './public-content.js';

const normalized = getRecordImage({ imageURL: 'https://github.com/edupathlanka/assets/blob/main/images/logo.png' }, 'images/course-placeholder.png');
assert.equal(normalized, 'https://raw.githubusercontent.com/edupathlanka/assets/main/images/logo.png');

const fallback = getRecordImage({ imageURL: '' }, 'images/course-placeholder.png');
assert.equal(fallback, 'images/course-placeholder.png');

console.log('public-content image regression test passed');
