import assert from 'node:assert/strict';
import { pipelineOwnerKey } from './owner';
assert.equal(pipelineOwnerKey(' Amy@Example.com '), pipelineOwnerKey('amy@example.com'));
assert.notEqual(pipelineOwnerKey('amy@example.com'), pipelineOwnerKey('someone@example.com'));
assert.match(pipelineOwnerKey('amy@example.com'), /^member:[a-f0-9]{64}$/);
assert.throws(() => pipelineOwnerKey(''), /verified owner/);
assert.throws(() => pipelineOwnerKey('default'), /verified owner/);
console.log('Saved-list owner isolation passed');
