/**
 * Moodle Integration API Client
 * Specification Reference: specs/02-moodle-integration-spec.md
 * 
 * Provides typed, firewall-evasive communication with Moodle Mobile Web Services REST API.
 */

export const MOODLE_CLIENT_USER_AGENT = 'MoodleMobile/4.4.0 (Android; SDK 34; wv) Mobile'
export const DEFAULT_REQUEST_TIMEOUT_MS = 10000

export class MoodleApiError extends Error {
  public errorCode?: string
  public exception?: string
  public httpStatus?: number

  constructor(message: string, errorCode?: string, exception?: string, httpStatus?: number) {
    super(message)
    this.name = 'MoodleApiError'
    this.errorCode = errorCode
    this.exception = exception
    this.httpStatus = httpStatus
  }
}

export interface MoodleSiteInfo {
  sitename: string
  username: string
  firstname: string
  lastname: string
  fullname: string
  lang: string
  userid: number
  siteurl: string
  userpictureurl?: string
  userissiteadmin?: boolean
  functions?: Array<{ name: string; version: string }>
}

export interface MoodleCourse {
  id: number
  shortname: string
  fullname: string
  displayname?: string
  category?: number
  summary?: string
  startdate?: number
  enddate?: number
  visible?: number
}

export interface MoodleModuleDate {
  label: string
  timestamp: number
}

export interface MoodleModuleContent {
  type: string
  filename: string
  filepath?: string
  filesize?: number
  fileurl?: string
  timemodified?: number
  mimetype?: string
}

export interface MoodleModule {
  id: number
  name: string
  instance?: number
  modname: 'resource' | 'assign' | 'forum' | 'url' | 'folder' | string
  modplural?: string
  url?: string
  visible?: number
  uservisible?: boolean
  dates?: MoodleModuleDate[]
  contents?: MoodleModuleContent[]
  contentsinfo?: {
    filescount: number
    filessize: number
  }
}

export interface MoodleSection {
  id: number
  name: string
  visible?: number
  summary?: string
  modules: MoodleModule[]
}

export interface MoodleDiscussion {
  id: number
  name: string
  timemodified: number
  usermodified: number
  userfullname: string
  message: string
  pinned?: boolean
  created?: number
}

/**
 * Executes a POST request to Moodle Mobile Web Services REST endpoint.
 */
export async function callMoodleApi<T>(
  baseUrl: string,
  functionName: string,
  wstoken: string,
  params: Record<string, string | number | boolean> = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<T> {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
  const endpoint = `${cleanBaseUrl}/webservice/rest/server.php`

  const bodyParams = new URLSearchParams()
  bodyParams.append('wstoken', wstoken)
  bodyParams.append('wsfunction', functionName)
  bodyParams.append('moodlewsrestformat', 'json')

  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      bodyParams.append(key, String(val))
    }
  }

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'User-Agent': MOODLE_CLIENT_USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: bodyParams.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new MoodleApiError(
        `Request to Moodle timed out after ${timeoutMs}ms (${functionName})`,
        'TIMEOUT',
        'timeout',
        408
      )
    }
    throw new MoodleApiError(
      `Network error connecting to Moodle: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK_ERROR',
      'fetch_failure'
    )
  }

  if (!response.ok) {
    throw new MoodleApiError(
      `Moodle server returned HTTP ${response.status} ${response.statusText}`,
      'HTTP_ERROR',
      'http_error',
      response.status
    )
  }

  const data = await response.json()

  // Moodle returns exceptions as 200 OK with exception/errorcode payload
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if ('exception' in data || 'errorcode' in data) {
      const errorMsg = data.message || data.error || 'Unknown Moodle Web Service exception'
      const errorCode = data.errorcode || 'UNKNOWN_EXCEPTION'
      const exception = data.exception || 'moodle_exception'
      throw new MoodleApiError(errorMsg, errorCode, exception, 200)
    }
  }

  return data as T
}

/**
 * 2.1 Function: core_webservice_get_site_info
 * Validates donor token and discovers Moodle student profile.
 */
export async function getSiteInfo(baseUrl: string, wstoken: string): Promise<MoodleSiteInfo> {
  const info = await callMoodleApi<MoodleSiteInfo>(
    baseUrl,
    'core_webservice_get_site_info',
    wstoken
  )

  if (!info.userid || typeof info.userid !== 'number' || info.userid <= 0) {
    throw new MoodleApiError(
      'Moodle response did not include a valid student userid',
      'INVALID_USERID',
      'validation_error'
    )
  }

  return info
}

/**
 * 2.2 Function: core_enrol_get_users_courses
 * Discovers enrolled courses for the donor student. Excludes hidden courses (visible === 0).
 */
export async function getUsersCourses(
  baseUrl: string,
  wstoken: string,
  userId: number
): Promise<MoodleCourse[]> {
  const courses = await callMoodleApi<MoodleCourse[]>(
    baseUrl,
    'core_enrol_get_users_courses',
    wstoken,
    { userid: userId }
  )

  if (!Array.isArray(courses)) {
    throw new MoodleApiError(
      'Expected an array of courses from core_enrol_get_users_courses',
      'INVALID_RESPONSE',
      'schema_mismatch'
    )
  }

  // Filter out hidden or unavailable courses
  return courses.filter((c) => c.visible !== 0)
}

/**
 * 2.3 Function: core_course_get_contents
 * Retrieves all sections and module items for a specific course.
 */
export async function getCourseContents(
  baseUrl: string,
  wstoken: string,
  courseId: number
): Promise<MoodleSection[]> {
  const sections = await callMoodleApi<MoodleSection[]>(
    baseUrl,
    'core_course_get_contents',
    wstoken,
    { courseid: courseId }
  )

  if (!Array.isArray(sections)) {
    throw new MoodleApiError(
      `Expected an array of sections from core_course_get_contents for course ${courseId}`,
      'INVALID_RESPONSE',
      'schema_mismatch'
    )
  }

  return sections
}

/**
 * 2.4 Function: mod_forum_get_forum_discussions
 * Fetches recent discussions from an announcement or course forum.
 */
export async function getForumDiscussions(
  baseUrl: string,
  wstoken: string,
  forumId: number,
  page = 0,
  perpage = 10
): Promise<MoodleDiscussion[]> {
  const response = await callMoodleApi<{ discussions: MoodleDiscussion[] }>(
    baseUrl,
    'mod_forum_get_forum_discussions',
    wstoken,
    {
      forumid: forumId,
      sortorder: 1, // DESC by created/modified
      page,
      perpage,
    }
  )

  if (!response || !Array.isArray(response.discussions)) {
    return []
  }

  return response.discussions
}

export interface MoodleLabel {
  id: number
  coursemodule: number
  course: number
  name: string
  intro: string
  timemodified: number
  section?: number
}

/**
 * 2.5 Function: mod_label_get_labels_by_courses
 * Retrieves text & media area labels for a course (used for direct announcements/updates).
 */
export async function getCourseLabels(
  baseUrl: string,
  wstoken: string,
  courseId: number
): Promise<MoodleLabel[]> {
  try {
    const response = await callMoodleApi<{ labels?: MoodleLabel[] }>(
      baseUrl,
      'mod_label_get_labels_by_courses',
      wstoken,
      { 'courseids[0]': courseId }
    )
    if (!response || !Array.isArray(response.labels)) {
      return []
    }
    return response.labels
  } catch (err) {
    console.warn(`Could not fetch labels for course ${courseId}:`, err)
    return []
  }
}

/**
 * 4.1 Sequential Polling with Jitter
 * Adds random delay between consecutive university requests to evade firewall triggers.
 */
export function getJitterDelay(minMs = 500, maxMs = 1200): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise((resolve) => setTimeout(resolve, delay))
}
