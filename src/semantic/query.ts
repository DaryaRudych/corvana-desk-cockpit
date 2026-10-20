// The ONLY way UI and AI read data (BUILD_INSTRUCTIONS §4.3):
// query() applies permissions, then calls the metric's compute on the scoped tables.
import { METRICS, NotInScopeError, type ComputeCtx, type MetricId, type ParamsOf, type ValueOf } from './metrics'
import { otherBusinessUnits, ownerOfEnquiry, restrictedMessage, scopedTables, userLabel, type UserContext } from './permissions'
import { SNAPSHOT } from './warehouse'

export interface QueryResult<V> {
  /** null when the whole value is withheld (see `restricted`). */
  value: V | null
  metricId: MetricId
  asOf: string
  /** Why something is withheld. May be set alongside a value when only the detail behind a total is restricted. */
  restricted?: string
}

/** Demo clock: the snapshot's frozen "now", so every reload shows the same queue. */
export const AS_OF = SNAPSHOT.now

export function query<K extends MetricId>(metricId: K, params: ParamsOf<K>, user: UserContext): QueryResult<ValueOf<K>> {
  const metric = METRICS[metricId]
  const withheld = (restricted: string): QueryResult<ValueOf<K>> => ({ value: null, metricId, asOf: AS_OF, restricted })

  // Object-level: metric hidden from this role.
  if (!(metric.visibleTo as string[]).includes(user.role)) {
    return withheld(`${metric.name} is visible to ${metric.visibleTo.join(', ')} only and isn't available to ${userLabel(user)}.`)
  }
  // Row-level: an explicit ask for another BU's data.
  const requestedBu = (params as { businessUnit?: string }).businessUnit
  if (requestedBu && requestedBu !== user.businessUnit) return withheld(restrictedMessage([requestedBu], user))

  const ctx: ComputeCtx = { user, t: scopedTables(user), now: new Date(AS_OF), today: AS_OF.slice(0, 10) }
  try {
    const compute = metric.compute as (c: ComputeCtx, p: ParamsOf<K>) => ValueOf<K>
    const value = compute(ctx, params)
    const restricted = 'detailRestricted' in metric && metric.detailRestricted ? `Detail restricted. ${restrictedMessage(otherBusinessUnits(user), user)}` : undefined
    return { value, metricId, asOf: AS_OF, ...(restricted && { restricted }) }
  } catch (err) {
    // Row-level: the row exists but belongs to another BU.
    if (err instanceof NotInScopeError) {
      const owner = ownerOfEnquiry(err.enquiryId)
      return withheld(owner ? restrictedMessage([owner], user) : `Enquiry ${err.enquiryId} not found.`)
    }
    throw err
  }
}

export { METRIC_CATALOG, type MetricId, type MetricMeta } from './metrics'
export { getDataVersion, subscribeToData } from './warehouse'
export { TRADER, COMPLIANCE_OFFICER, businessUnitName, describeAccess, userLabel, type UserContext } from './permissions'
