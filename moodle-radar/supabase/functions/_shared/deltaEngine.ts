/**
 * Delta Detection & Watermarking Engine
 * Specification Reference: specs/02-moodle-integration-spec.md Section 3
 * 
 * Compares incoming Moodle modules against historical watermarks in
 * `course_items_state` to guarantee zero duplicate alerts.
 */

import type { MoodleModule, MoodleDiscussion } from './moodleClient.ts'

export type DeltaEventType = 'EVENT_CREATED' | 'EVENT_UPDATED' | 'NO_ACTION'

export interface CourseFilterConfig {
  filter_forum: boolean
  filter_assign: boolean
  filter_resources: boolean
}

export interface StoredItemState {
  composite_id: string
  course_id: number
  item_type: string
  timemodified: number
}

export interface DeltaEvent {
  eventType: 'EVENT_CREATED' | 'EVENT_UPDATED'
  compositeId: string
  courseId: number
  itemType: 'mod_forum' | 'mod_assign' | 'mod_resource' | 'mod_url'
  itemTitle: string
  timemodified: number
  rawItem: MoodleModule | MoodleDiscussion
}

/**
 * 3.1 Composite ID Formatting Rules
 */
export function buildCompositeId(
  courseId: number,
  itemType: 'mod_forum' | 'mod_assign' | 'mod_resource' | 'mod_url',
  itemId: number | string
): string {
  return `${courseId}:${itemType}:${itemId}`
}

/**
 * 3.2 Watermarking Timestamp Extraction Rules
 */
export function extractModuleTimestamp(module: MoodleModule): number {
  if (module.modname === 'label') {
    if ((module as any).timemodified) return (module as any).timemodified
  }

  if (module.modname === 'assign') {
    const modifiedDate = module.dates?.find((d) => d.label?.toLowerCase().includes('modified'))
    if (modifiedDate) return modifiedDate.timestamp

    const dueDate = module.dates?.find((d) => d.label?.toLowerCase().includes('due'))
    if (dueDate) return dueDate.timestamp
  }

  // Resources, files, folders, URLs
  if (module.contents && module.contents.length > 0) {
    const firstWithTime = module.contents.find((c) => c.timemodified && c.timemodified > 0)
    if (firstWithTime?.timemodified) {
      return firstWithTime.timemodified
    }
  }

  const genericModified = module.dates?.find((d) => d.label?.toLowerCase().includes('modified'))
  if (genericModified) return genericModified.timestamp

  return Math.floor(Date.now() / 1000)
}

/**
 * Evaluates whether a module should be monitored based on course filters.
 */
export function isModuleAllowedByFilter(
  modname: string,
  filterConfig: CourseFilterConfig
): boolean {
  if (modname === 'forum' || modname === 'label') {
    return filterConfig.filter_forum !== false
  }
  if (modname === 'assign') {
    return filterConfig.filter_assign !== false
  }
  if (['resource', 'url', 'folder'].includes(modname)) {
    return filterConfig.filter_resources !== false
  }
  return false
}

/**
 * 3.3 Delta Comparator for Moodle Course Modules (Assignments, Resources, URLs, Labels)
 */
export function evaluateModuleDelta(
  courseId: number,
  module: MoodleModule,
  existingWatermark: StoredItemState | undefined,
  filterConfig: CourseFilterConfig
): DeltaEvent | null {
  if (!module.visible) return null

  let itemType: 'mod_forum' | 'mod_assign' | 'mod_resource' | 'mod_url'
  if (module.modname === 'assign') {
    itemType = 'mod_assign'
  } else if (module.modname === 'url') {
    itemType = 'mod_url'
  } else if (module.modname === 'resource' || module.modname === 'folder') {
    itemType = 'mod_resource'
  } else if (module.modname === 'label') {
    itemType = 'mod_forum' // Classified as direct course announcement
  } else {
    return null // Unsupported module type
  }

  if (!isModuleAllowedByFilter(module.modname, filterConfig)) {
    return null
  }

  const compositeId = buildCompositeId(courseId, itemType, module.id)
  const incomingTime = extractModuleTimestamp(module)

  // Case A: New Item
  if (!existingWatermark) {
    return {
      eventType: 'EVENT_CREATED',
      compositeId,
      courseId,
      itemType,
      itemTitle: module.name,
      timemodified: incomingTime,
      rawItem: module,
    }
  }

  // Case B: Modified Item
  if (incomingTime > existingWatermark.timemodified) {
    return {
      eventType: 'EVENT_UPDATED',
      compositeId,
      courseId,
      itemType,
      itemTitle: module.name,
      timemodified: incomingTime,
      rawItem: module,
    }
  }

  // Case C: Stale / Unchanged
  return null
}

/**
 * 3.3 Delta Comparator for Forum Announcement Discussions
 */
export function evaluateDiscussionDelta(
  courseId: number,
  discussion: MoodleDiscussion,
  existingWatermark: StoredItemState | undefined,
  filterConfig: CourseFilterConfig
): DeltaEvent | null {
  if (!filterConfig.filter_forum) return null

  const itemType = 'mod_forum'
  const compositeId = buildCompositeId(courseId, itemType, discussion.id)
  const incomingTime = discussion.timemodified || discussion.created || Math.floor(Date.now() / 1000)

  // Case A: New Discussion
  if (!existingWatermark) {
    return {
      eventType: 'EVENT_CREATED',
      compositeId,
      courseId,
      itemType,
      itemTitle: discussion.name,
      timemodified: incomingTime,
      rawItem: discussion,
    }
  }

  // Case B: Modified Discussion
  if (incomingTime > existingWatermark.timemodified) {
    return {
      eventType: 'EVENT_UPDATED',
      compositeId,
      courseId,
      itemType,
      itemTitle: discussion.name,
      timemodified: incomingTime,
      rawItem: discussion,
    }
  }

  // Case C: Stale
  return null
}
