import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWebConfig } from '../check-web-config.mjs';

test('deployment rejects placeholders, mismatched projects and malformed auth domains', () => {
  const valid = {projectId:'example-project',appId:'1:123:web:example',apiKey:'sample-web-key',authDomain:'example-project.firebaseapp.com'};
  assert.doesNotThrow(() => validateWebConfig(valid, 'example-project'));
  assert.throws(() => validateWebConfig({...valid, apiKey:'YOUR_API_KEY'}, 'example-project'));
  assert.throws(() => validateWebConfig(valid, 'other-project'));
  assert.throws(() => validateWebConfig({...valid, authDomain:'https://example.com/path'}, 'example-project'));
  assert.throws(() => validateWebConfig({...valid, appId:''}, 'example-project'));
});
