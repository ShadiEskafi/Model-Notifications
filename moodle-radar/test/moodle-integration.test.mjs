import assert from 'node:assert/strict'
import {
  buildCompositeId,
  extractModuleTimestamp,
  isModuleAllowedByFilter,
  evaluateModuleDelta,
  evaluateDiscussionDelta,
} from '../supabase/functions/_shared/deltaEngine.ts'
import { CircuitBreaker } from '../supabase/functions/_shared/circuitBreaker.ts'
import { MoodleApiError } from '../supabase/functions/_shared/moodleClient.ts'

console.log('🧪 Starting Spec 02 Moodle Integration Test Suite...\n')

// ---------------------------------------------------------------------------
// Test 1: Composite ID Formatting Rules
// ---------------------------------------------------------------------------
console.log('1. Testing Composite ID Generation...')
assert.equal(buildCompositeId(1042, 'mod_forum', 3410), '1042:mod_forum:3410')
assert.equal(buildCompositeId(1042, 'mod_assign', 9820), '1042:mod_assign:9820')
assert.equal(buildCompositeId(1042, 'mod_resource', 9814), '1042:mod_resource:9814')
assert.equal(buildCompositeId(1042, 'mod_url', 5512), '1042:mod_url:5512')
console.log('   ✅ Composite ID formatting passed.')

// ---------------------------------------------------------------------------
// Test 2: Timestamp Extraction Rules
// ---------------------------------------------------------------------------
console.log('2. Testing Timestamp Extraction...')
const resourceModule = {
  id: 9814,
  name: 'Lecture 05 - RSA Slides.pdf',
  modname: 'resource',
  visible: 1,
  contents: [
    {
      type: 'file',
      filename: 'Lecture_05_RSA.pdf',
      timemodified: 1713342000,
    },
  ],
}
assert.equal(extractModuleTimestamp(resourceModule), 1713342000)

const assignmentModule = {
  id: 9820,
  name: 'Lab Assignment 2',
  modname: 'assign',
  visible: 1,
  dates: [
    { label: 'Due', timestamp: 1713999600 },
    { label: 'Modified', timestamp: 1713500000 },
  ],
}
const noDateModule = {
  id: 4214,
  name: 'Online Session 1 F',
  modname: 'url',
  visible: 1,
  uservisible: false,
}
assert.equal(extractModuleTimestamp(noDateModule), 0)
console.log('   ✅ Timestamp extraction rules passed.')

// ---------------------------------------------------------------------------
// Test 3: Module Filter Permissions
// ---------------------------------------------------------------------------
console.log('3. Testing Module Notification Filters...')
const filterConfig = {
  filter_forum: true,
  filter_assign: false,
  filter_resources: true,
}
assert.equal(isModuleAllowedByFilter('forum', filterConfig), true)
assert.equal(isModuleAllowedByFilter('assign', filterConfig), false)
assert.equal(isModuleAllowedByFilter('resource', filterConfig), true)
assert.equal(isModuleAllowedByFilter('folder', filterConfig), true)
assert.equal(isModuleAllowedByFilter('url', filterConfig), true)
console.log('   ✅ Filter permissions evaluation passed.')

// ---------------------------------------------------------------------------
// Test 4: Delta Detection Engine - Module Evaluation
// ---------------------------------------------------------------------------
console.log('4. Testing Delta Comparator for Modules...')
const courseId = 1042

// Case A: New Item (no watermark)
const newResult = evaluateModuleDelta(courseId, resourceModule, undefined, filterConfig)
assert.ok(newResult)
assert.equal(newResult.eventType, 'EVENT_CREATED')
assert.equal(newResult.compositeId, '1042:mod_resource:9814')
assert.equal(newResult.timemodified, 1713342000)

// Case B: Modified Item (incoming timemodified > stored watermark)
const existingStaleWatermark = {
  composite_id: '1042:mod_resource:9814',
  course_id: courseId,
  item_type: 'mod_resource',
  timemodified: 1713340000, // older than 1713342000
}
const updatedResult = evaluateModuleDelta(courseId, resourceModule, existingStaleWatermark, filterConfig)
assert.ok(updatedResult)
assert.equal(updatedResult.eventType, 'EVENT_UPDATED')
assert.equal(updatedResult.compositeId, '1042:mod_resource:9814')

// Case C: Stale / Unchanged Item (incoming timemodified <= stored watermark)
const existingFreshWatermark = {
  composite_id: '1042:mod_resource:9814',
  course_id: courseId,
  item_type: 'mod_resource',
  timemodified: 1713342000, // identical to incoming
}
const staleResult = evaluateModuleDelta(courseId, resourceModule, existingFreshWatermark, filterConfig)
assert.equal(staleResult, null)

// Filter exclusion test (assignments are disabled in filterConfig)
const assignResult = evaluateModuleDelta(courseId, assignmentModule, undefined, filterConfig)
assert.equal(assignResult, null)

// Restricted cohort exclusion test (uservisible === false)
const restrictedResult = evaluateModuleDelta(courseId, noDateModule, undefined, filterConfig)
assert.equal(restrictedResult, null)
console.log('   ✅ Module delta engine state transitions passed.')

// ---------------------------------------------------------------------------
// Test 5: Delta Detection Engine - Discussion Evaluation
// ---------------------------------------------------------------------------
console.log('5. Testing Delta Comparator for Forum Announcements...')
const discussion = {
  id: 3410,
  name: 'Midterm Exam Schedule',
  timemodified: 1713345600,
  usermodified: 401,
  userfullname: 'Dr. Khalid Omar',
  message: 'Section 1 will be in Lab 402',
}

const newDiscussionEvent = evaluateDiscussionDelta(courseId, discussion, undefined, filterConfig)
assert.ok(newDiscussionEvent)
assert.equal(newDiscussionEvent.eventType, 'EVENT_CREATED')
assert.equal(newDiscussionEvent.compositeId, '1042:mod_forum:3410')

// Stale discussion
const staleDiscussionWatermark = {
  composite_id: '1042:mod_forum:3410',
  course_id: courseId,
  item_type: 'mod_forum',
  timemodified: 1713345600,
}
const staleDiscussionEvent = evaluateDiscussionDelta(courseId, discussion, staleDiscussionWatermark, filterConfig)
assert.equal(staleDiscussionEvent, null)
console.log('   ✅ Forum announcement delta engine passed.')

// ---------------------------------------------------------------------------
// Test 6: Circuit Breaker State Transitions
// ---------------------------------------------------------------------------
console.log('6. Testing Circuit Breaker State Machine...')
const breaker = new CircuitBreaker({ maxConsecutiveFailures: 3 })

assert.equal(breaker.getState(), 'CLOSED')
assert.equal(breaker.canExecute(), true)

// Failure 1
breaker.recordFailure(new Error('500 Internal Server Error'))
assert.equal(breaker.getState(), 'CLOSED')
assert.equal(breaker.getConsecutiveFailures(), 1)
assert.equal(breaker.canExecute(), true)

// Failure 2
breaker.recordFailure(new Error('Timeout on course 1043'))
assert.equal(breaker.getState(), 'CLOSED')
assert.equal(breaker.getConsecutiveFailures(), 2)
assert.equal(breaker.canExecute(), true)

// Failure 3 -> Trips Circuit
const tripped = breaker.recordFailure(new Error('502 Bad Gateway'))
assert.equal(tripped, true)
assert.equal(breaker.getState(), 'TRIPPED')
assert.equal(breaker.canExecute(), false)
assert.equal(breaker.getLastIncidentSummary(), '502 Bad Gateway')

// Reset upon success
breaker.recordSuccess()
assert.equal(breaker.getState(), 'CLOSED')
assert.equal(breaker.canExecute(), true)
assert.equal(breaker.getConsecutiveFailures(), 0)
console.log('   ✅ Circuit Breaker state transitions passed.')

// ---------------------------------------------------------------------------
// Test 7: Moodle API Error Normalization
// ---------------------------------------------------------------------------
console.log('7. Testing Moodle API Error Normalization...')
const err = new MoodleApiError('Invalid token or account locked', 'invalidtoken', 'accessexception', 200)
assert.equal(err.name, 'MoodleApiError')
assert.equal(err.errorCode, 'invalidtoken')
assert.equal(err.exception, 'accessexception')
assert.equal(err.httpStatus, 200)
console.log('   ✅ Moodle API error normalization passed.')

console.log('\n🎉 ALL SPEC 02 MOODLE INTEGRATION TESTS PASSED CLEANLY!\n')
